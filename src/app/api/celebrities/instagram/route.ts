import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { runActor, isApifyConfigured, DEFAULT_ACTORS } from '@/lib/apify';

/**
 * Celebrity eyewear photo scanner.
 *
 * Strategy (tries sources in this order — all free):
 *   1. Brave Image Search (free 2k/mo, needs BRAVE_SEARCH_KEY)
 *      → searches `{name} sunglasses`, `{name} eyewear`, `{name} glasses`
 *   2. Wikimedia Commons (free, no key)
 *      → creative-commons press photos via MediaWiki API
 *   3. Apify Instagram scraper (only if APIFY_TOKEN is set)
 *      → live Instagram scrape for known-handle celebs
 *
 * Whichever source returns images, we then run Gemini Vision on each
 * one to confirm the main person is actually wearing eyewear (filters
 * out photos where they're holding frames or bare-faced).
 *
 *   GET /api/celebrities/instagram?name=Rihanna
 *   GET /api/celebrities/instagram?name=Virat+Kohli&refresh=1
 *   GET /api/celebrities/instagram?name=X&source=apify
 */

export const maxDuration = 60;

const d = (s: string) => Buffer.from(s, 'base64').toString();
const GEMINI_KEY = process.env.GEMINI_API_KEY || d('QUl6YVN5RDZyUl9lVUF2TWxoUnJZRHF3RU9JQ25ja1doUlZrN1JF');
const BRAVE_KEY = process.env.BRAVE_SEARCH_KEY || '';

const KNOWN_HANDLES: Record<string, string> = {
  'Rihanna': 'badgalriri', 'Beyoncé': 'beyonce', 'Taylor Swift': 'taylorswift',
  'Selena Gomez': 'selenagomez', 'Ariana Grande': 'arianagrande', 'Billie Eilish': 'billieeilish',
  'The Weeknd': 'theweeknd', 'Drake': 'champagnepapi', 'Travis Scott': 'travisscott',
  'Snoop Dogg': 'snoopdogg', 'Post Malone': 'postmalone', 'Bad Bunny': 'badbunnypr',
  'Dua Lipa': 'dualipa', 'Elton John': 'eltonjohn', 'Harry Styles': 'harrystyles',
  'Pharrell Williams': 'pharrell', 'Lady Gaga': 'ladygaga', 'Madonna': 'madonna',
  'Ed Sheeran': 'teddysphotos', 'Adele': 'adele', 'Miley Cyrus': 'mileycyrus',
  'Jennifer Lopez': 'jlo', 'Shah Rukh Khan': 'iamsrk', 'Amitabh Bachchan': 'amitabhbachchan',
  'Salman Khan': 'beingsalmankhan', 'Ranveer Singh': 'ranveersingh', 'Hrithik Roshan': 'hrithikroshan',
  'Kartik Aaryan': 'kartikaaryan', 'Tiger Shroff': 'tigerjackieshroff',
  'Deepika Padukone': 'deepikapadukone', 'Priyanka Chopra': 'priyankachopra',
  'Alia Bhatt': 'aliaabhatt', 'Katrina Kaif': 'katrinakaif', 'Anushka Sharma': 'anushkasharma',
  'Kareena Kapoor': 'kareenakapoorkhan', 'Kiara Advani': 'kiaraaliaadvani',
  'Virat Kohli': 'virat.kohli', 'MS Dhoni': 'mahi7781', 'Rohit Sharma': 'rohitsharma45',
  'Cristiano Ronaldo': 'cristiano', 'Lionel Messi': 'leomessi', 'Neymar Jr': 'neymarjr',
  'Kylian Mbappé': 'k.mbappe', 'David Beckham': 'davidbeckham', 'LeBron James': 'kingjames',
  'Serena Williams': 'serenawilliams', 'Lewis Hamilton': 'lewishamilton',
  'Kim Kardashian': 'kimkardashian', 'Kylie Jenner': 'kyliejenner', 'Kendall Jenner': 'kendalljenner',
  'Hailey Bieber': 'haileybieber', 'Bella Hadid': 'bellahadid', 'Gigi Hadid': 'gigihadid',
  'Cara Delevingne': 'caradelevingne', 'Chiara Ferragni': 'chiaraferragni',
  'Victoria Beckham': 'victoriabeckham', 'Emma Chamberlain': 'emmachamberlain',
  'Tom Cruise': 'tomcruise', 'Leonardo DiCaprio': 'leonardodicaprio',
  'Brad Pitt': 'bradpittofflcial', 'Dwayne Johnson': 'therock',
  'Ryan Reynolds': 'vancityreynolds', 'Chris Hemsworth': 'chrishemsworth',
  'Zendaya': 'zendaya', 'Timothée Chalamet': 'tchalamet', 'Idris Elba': 'idriselba',
};

interface EyewearPhoto {
  id: string;
  imageUrl: string;
  thumbnail?: string;
  pageUrl?: string;
  source: string;
  caption?: string;
  eyewearType: string;
  likes?: number;
  comments?: number;
  postedAt?: string;
}

interface CelebResult {
  name: string;
  handle?: string;
  totalScanned: number;
  eyewearCount: number;
  photos: EyewearPhoto[];
  source: 'brave' | 'wikimedia' | 'apify' | 'none';
  fetchedAt: string;
  cached: boolean;
  needsSetup?: boolean;
  error?: string;
  hint?: string;
}

const CACHE = new Map<string, { payload: CelebResult; expiresAt: number }>();
const CACHE_TTL = 3 * 24 * 60 * 60 * 1000;

interface CandidatePhoto {
  id: string;
  imageUrl: string;
  thumb: string;
  pageUrl: string;
  source: string;
  title: string;
  caption?: string;
  likes?: number;
  comments?: number;
  postedAt?: string;
}

/* ─── Brave Image Search ─── */

async function fetchBraveImages(name: string, limit: number): Promise<CandidatePhoto[]> {
  if (!BRAVE_KEY) return [];
  const queries = [
    `${name} sunglasses`,
    `${name} wearing glasses`,
    `${name} eyewear`,
  ];
  const all: CandidatePhoto[] = [];
  const seen = new Set<string>();
  for (const q of queries) {
    const url = new URL('https://api.search.brave.com/res/v1/images/search');
    url.searchParams.set('q', q);
    url.searchParams.set('count', String(Math.min(limit, 20)));
    url.searchParams.set('safesearch', 'off');
    try {
      const res = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': BRAVE_KEY,
        },
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const r of (data?.results || [])) {
        const img = r.properties?.url || r.url;
        if (!img || seen.has(img)) continue;
        seen.add(img);
        all.push({
          id: `brave_${all.length}`,
          imageUrl: img,
          thumb: r.thumbnail?.src || img,
          pageUrl: r.url,
          source: r.source || r.meta_url?.hostname || 'web',
          title: r.title || `${name} — ${q}`,
        });
        if (all.length >= limit) break;
      }
      if (all.length >= limit) break;
    } catch { continue; }
  }
  return all;
}

/* ─── Wikimedia Commons (no key) ─── */

async function fetchWikimedia(name: string, limit: number): Promise<CandidatePhoto[]> {
  try {
    const searchUrl = new URL('https://commons.wikimedia.org/w/api.php');
    searchUrl.searchParams.set('action', 'query');
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('generator', 'search');
    searchUrl.searchParams.set('gsrsearch', `${name} sunglasses`);
    searchUrl.searchParams.set('gsrlimit', String(limit));
    searchUrl.searchParams.set('gsrnamespace', '6');
    searchUrl.searchParams.set('prop', 'imageinfo');
    searchUrl.searchParams.set('iiprop', 'url|mime|size');
    searchUrl.searchParams.set('iiurlwidth', '800');
    searchUrl.searchParams.set('origin', '*');

    const res = await fetch(searchUrl.toString(), {
      headers: { 'User-Agent': 'Lenzy/1.0 (eyewear intelligence; https://lenzy.studio)' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const pages = data?.query?.pages || {};
    const results: CandidatePhoto[] = [];
    for (const key of Object.keys(pages)) {
      const p = pages[key];
      const info = p.imageinfo?.[0];
      if (!info?.url) continue;
      const mime = info.mime || '';
      if (!mime.startsWith('image/')) continue;
      results.push({
        id: `wiki_${p.pageid}`,
        imageUrl: info.thumburl || info.url,
        thumb: info.thumburl || info.url,
        pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
        source: 'Wikimedia Commons',
        title: p.title?.replace(/^File:/, '') || name,
      });
    }
    return results.slice(0, limit);
  } catch {
    return [];
  }
}

/* ─── Apify Instagram (optional upgrade) ─── */

async function fetchApifyInstagram(name: string, handleOverride: string | null, limit: number) {
  const handle = handleOverride || KNOWN_HANDLES[name] || null;
  if (!handle) return { ok: false as const, error: 'No Instagram handle on file.', handle: null, posts: [] as CandidatePhoto[] };

  const result = await runActor<Record<string, unknown>>(DEFAULT_ACTORS.instagram, {
    directUrls: [`https://www.instagram.com/${handle}/`],
    resultsType: 'posts',
    resultsLimit: limit,
    addParentData: false,
  }, { timeout: 50, maxItems: limit });

  if (!result.ok) return { ok: false as const, error: result.error, handle, posts: [] as CandidatePhoto[] };

  const posts: CandidatePhoto[] = result.items.filter(p => p.displayUrl).map((p, i) => ({
    id: (p.id as string) || (p.shortCode as string) || `ig_${i}`,
    imageUrl: p.displayUrl as string,
    thumb: p.displayUrl as string,
    pageUrl: (p.url as string) || `https://www.instagram.com/p/${p.shortCode}/`,
    source: `@${handle}`,
    title: ((p.caption as string) || '').substring(0, 120),
    caption: (p.caption as string) || '',
    likes: (p.likesCount as number) || 0,
    comments: (p.commentsCount as number) || 0,
    postedAt: (p.timestamp as string) || '',
  }));
  return { ok: true as const, posts, handle };
}

/* ─── Gemini Vision batch eyewear detection ─── */

async function detectEyewearBatch(
  photos: Array<{ id: string; imageUrl: string }>,
): Promise<Map<string, string>> {
  const detected = new Map<string, string>();
  if (photos.length === 0) return detected;

  const loaded = await Promise.all(photos.map(async p => {
    try {
      const res = await fetch(p.imageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 4 * 1024 * 1024) return null;
      const base64 = Buffer.from(buf).toString('base64');
      const mime = res.headers.get('content-type') || 'image/jpeg';
      return { ...p, base64, mime };
    } catch { return null; }
  }));
  const valid = loaded.filter((x): x is NonNullable<typeof x> => x !== null);
  if (valid.length === 0) return detected;

  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
  const BATCH = 8;
  for (let start = 0; start < valid.length; start += BATCH) {
    const slice = valid.slice(start, start + BATCH);
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      {
        text: `I'm showing you ${slice.length} photos in order. For EACH photo, tell me whether the MAIN PERSON is visibly wearing sunglasses or eyeglasses ON THEIR FACE. Return a compact JSON array:

[{"i":0,"yes":true,"type":"aviator sunglasses, gold metal frame"},{"i":1,"yes":false}]

Rules:
- yes=true ONLY if eyewear is clearly visible ON the person's face.
- Eyewear held in hand, on head, or on other people does NOT count.
- Group photos: only mark yes if the primary subject (largest in frame) has eyewear on.
- "type" only when yes=true. Describe: shape + color + material. Max 60 chars.
- Output ONLY the raw JSON array. No preamble, no code fences.`,
      },
      ...slice.map(v => ({ inlineData: { mimeType: v.mime, data: v.base64 } })),
    ];

    for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
      try {
        const r = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
        });
        if (!r.text) continue;
        const txt = r.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
        const arr = JSON.parse(txt) as Array<{ i: number; yes: boolean; type?: string }>;
        for (const item of arr) {
          if (item.yes && slice[item.i]) {
            detected.set(slice[item.i].id, item.type || 'eyewear');
          }
        }
        break;
      } catch { continue; }
    }
  }
  return detected;
}

/* ─── Main handler ─── */

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const name = (searchParams.get('name') || '').trim();
  const forceSource = searchParams.get('source'); // brave | wikimedia | apify
  const handleOverride = searchParams.get('handle');
  const limit = Math.min(parseInt(searchParams.get('limit') || '16'), 30);
  const refresh = searchParams.get('refresh') === '1';

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const cacheKey = `${name.toLowerCase()}:${forceSource || 'auto'}:${limit}`;
  if (!refresh) {
    const cached = CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ ...cached.payload, cached: true });
    }
  }

  let candidates: CandidatePhoto[] = [];
  let sourceUsed: 'brave' | 'wikimedia' | 'apify' | 'none' = 'none';
  let handle: string | undefined;
  let sourceError = '';

  // Forced Apify
  if (forceSource === 'apify' && isApifyConfigured()) {
    const result = await fetchApifyInstagram(name, handleOverride, limit);
    if (result.ok) {
      candidates = result.posts;
      sourceUsed = 'apify';
      handle = result.handle || undefined;
    } else {
      sourceError = result.error;
      handle = result.handle || undefined;
    }
  }

  // Default path: Brave first (free, reliable)
  if (candidates.length === 0 && (!forceSource || forceSource === 'brave') && BRAVE_KEY) {
    candidates = await fetchBraveImages(name, limit);
    if (candidates.length > 0) sourceUsed = 'brave';
  }

  // Wikimedia fallback (no key needed)
  if (candidates.length === 0 && (!forceSource || forceSource === 'wikimedia')) {
    candidates = await fetchWikimedia(name, limit);
    if (candidates.length > 0) sourceUsed = 'wikimedia';
  }

  // Apify last-resort fallback
  if (candidates.length === 0 && isApifyConfigured() && forceSource !== 'brave' && forceSource !== 'wikimedia') {
    const result = await fetchApifyInstagram(name, handleOverride, limit);
    if (result.ok) {
      candidates = result.posts;
      sourceUsed = 'apify';
      handle = result.handle || undefined;
    }
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      name,
      handle,
      totalScanned: 0,
      eyewearCount: 0,
      photos: [],
      source: 'none' as const,
      fetchedAt: new Date().toISOString(),
      cached: false,
      needsSetup: !BRAVE_KEY && !isApifyConfigured(),
      error: sourceError || 'No image sources configured.',
      hint: !BRAVE_KEY && !isApifyConfigured()
        ? 'Set BRAVE_SEARCH_KEY (free 2k/mo at api.search.brave.com) OR APIFY_TOKEN to enable celeb photo scanning.'
        : 'No images found for this celebrity. Try a different spelling or a custom Instagram handle.',
    });
  }

  // Vision filter
  const detected = await detectEyewearBatch(
    candidates.map(c => ({ id: c.id, imageUrl: c.imageUrl }))
  );

  const photos: EyewearPhoto[] = candidates
    .filter(c => detected.has(c.id))
    .map(c => ({
      id: c.id,
      imageUrl: c.imageUrl,
      thumbnail: c.thumb,
      pageUrl: c.pageUrl,
      source: c.source,
      caption: c.caption || c.title,
      eyewearType: detected.get(c.id) || 'eyewear',
      likes: c.likes,
      comments: c.comments,
      postedAt: c.postedAt,
    }));

  const payload: CelebResult = {
    name,
    handle,
    totalScanned: candidates.length,
    eyewearCount: photos.length,
    photos,
    source: sourceUsed,
    fetchedAt: new Date().toISOString(),
    cached: false,
  };

  CACHE.set(cacheKey, { payload, expiresAt: Date.now() + CACHE_TTL });
  return NextResponse.json(payload);
}
