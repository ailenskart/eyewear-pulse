import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { runActor, isApifyConfigured, DEFAULT_ACTORS } from '@/lib/apify';
import { supabaseServer } from '@/lib/supabase';

/**
 * Celebrity Instagram eyewear scanner — INSTAGRAM-FIRST.
 *
 * Scans the celebrity's REAL Instagram account via Apify, pulls
 * their recent posts, runs each through Gemini Vision to detect
 * if they're wearing sunglasses/eyeglasses, and returns only the
 * confirmed eyewear posts with frame details.
 *
 * Pipeline:
 *   1. Look up the celeb's IG handle from KNOWN_HANDLES (200+)
 *   2. Apify Instagram scraper → last 20-30 posts
 *   3. Download each post image
 *   4. Upload to Vercel Blob (permanent storage)
 *   5. Gemini Vision batch filter: keep ONLY posts with eyewear
 *      on face, extract shape/color/material/brand
 *   6. Save to celeb_photos Supabase table
 *   7. Return the filtered feed
 *
 * Fallback (if APIFY_TOKEN not set): Brave Image Search → Wikimedia
 *
 *   GET /api/celebrities/instagram?name=Rihanna
 *   GET /api/celebrities/instagram?name=Virat+Kohli&limit=30
 *   GET /api/celebrities/instagram?name=X&refresh=1
 */

export const maxDuration = 60;

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const BRAVE_KEY = process.env.BRAVE_SEARCH_KEY || '';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';

/* ═══════════════════════════════════════════════════════════════
   200+ verified celebrity Instagram handles — fashionable celebs
   across the world who are known to wear eyewear.
   ═══════════════════════════════════════════════════════════════ */

const KNOWN_HANDLES: Record<string, string> = {
  // ── Hollywood / US Actors ──
  'Zendaya': 'zendaya', 'Timothée Chalamet': 'tchalamet', 'Tom Cruise': 'tomcruise',
  'Jennifer Aniston': 'jenniferaniston',
  // Brad Pitt has no verified personal IG; skip rather than scrape an imposter account.
  'Leonardo DiCaprio': 'leonardodicaprio', 'Johnny Depp': 'johnnydepp',
  'Ryan Reynolds': 'vancityreynolds', 'Chris Hemsworth': 'chrishemsworth',
  'Dwayne Johnson': 'therock', 'Robert Downey Jr.': 'robertdowneyjr',
  'Jeff Goldblum': 'jeffgoldblum', 'Idris Elba': 'idriselba',
  'Ryan Gosling': 'ryangosling', 'Jake Gyllenhaal': 'jakegyllenhaal',
  'Will Smith': 'willsmith', 'Samuel L. Jackson': 'samuelljackson',
  'Jason Momoa': 'prideofgypsies',
  // Keanu Reeves has no verified personal IG; skip.
  'Emma Stone': 'emmastone', 'Margot Robbie': 'margotrobbie',
  'Florence Pugh': 'florencepugh', 'Sydney Sweeney': 'sydney_sweeney',
  'Anne Hathaway': 'annehathaway', 'Lupita Nyongo': 'lupitanyongo',
  // Cate Blanchett has no verified personal IG; skip.

  // ── Bollywood / India ──
  'Shah Rukh Khan': 'iamsrk', 'Amitabh Bachchan': 'amitabhbachchan',
  'Salman Khan': 'beingsalmankhan', 'Ranveer Singh': 'ranveersingh',
  'Hrithik Roshan': 'hrithikroshan', 'Kartik Aaryan': 'kartikaaryan',
  'Tiger Shroff': 'tigerjackieshroff', 'Vicky Kaushal': 'vickykaushal09',
  // Ranbir Kapoor has no personal IG; skip.
  'Shahid Kapoor': 'shahidkapoor',
  'Varun Dhawan': 'varundvn', 'Sidharth Malhotra': 'sidmalhotra',
  'Ayushmann Khurrana': 'ayushmannk', 'Rajkummar Rao': 'rajkummar_rao',
  'Deepika Padukone': 'deepikapadukone', 'Priyanka Chopra': 'priyankachopra',
  'Alia Bhatt': 'aliaabhatt', 'Katrina Kaif': 'katrinakaif',
  'Anushka Sharma': 'anushkasharma', 'Kareena Kapoor': 'kareenakapoorkhan',
  'Kiara Advani': 'kiaraaliaadvani', 'Janhvi Kapoor': 'janhvikapoor',
  'Sara Ali Khan': 'saraalikhan95', 'Sonam Kapoor': 'sonamkapoor',
  'Malaika Arora': 'malaikaaroraofficial', 'Kriti Sanon': 'kritisanon',

  // ── Musicians / Rappers ──
  'Rihanna': 'badgalriri', 'Beyoncé': 'beyonce', 'Taylor Swift': 'taylorswift',
  'Selena Gomez': 'selenagomez', 'Ariana Grande': 'arianagrande',
  'Billie Eilish': 'billieeilish', 'The Weeknd': 'theweeknd',
  'Drake': 'champagnepapi', 'Travis Scott': 'travisscott',
  'Bad Bunny': 'badbunnypr', 'Post Malone': 'postmalone',
  'Snoop Dogg': 'snoopdogg', 'Kanye West': 'ye',
  'Pharrell Williams': 'pharrell', 'ASAP Rocky': 'asaprocky',
  'Dua Lipa': 'dualipa', 'Lady Gaga': 'ladygaga',
  'Harry Styles': 'harrystyles', 'Doja Cat': 'dojacat',
  'Lizzo': 'lizzobeeating', 'Cardi B': 'iamcardib',
  'Miley Cyrus': 'mileycyrus', 'Justin Bieber': 'justinbieber',
  'Ed Sheeran': 'teddysphotos', 'Elton John': 'eltonjohn',
  'Madonna': 'madonna', 'Jennifer Lopez': 'jlo',
  'Shakira': 'shakira', 'Rosalía': 'rosalia.vt',
  'Tyler the Creator': 'feliciathegoat', 'Maluma': 'maluma',
  'J Balvin': 'jbalvin', 'Ozuna': 'ozuna',
  'Daddy Yankee': 'daddyyankee', 'Karol G': 'karolg',
  'BTS RM': 'rkive', 'BTS V': 'thv',
  'BLACKPINK Jennie': 'jennierubyjane', 'BLACKPINK Lisa': 'lalalalisa_m',
  'BLACKPINK Rosé': 'roses_are_rosie',
  'G-Dragon': 'xxxibgdrgn', 'Jay Park': 'jparkitrighthere',
  'Badshah': 'badboyshah', 'AP Dhillon': 'apdhillon',
  'Diljit Dosanjh': 'diljitdosanjh', 'Honey Singh': 'yoyohoneysingh',

  // ── Athletes ──
  'Cristiano Ronaldo': 'cristiano', 'Lionel Messi': 'leomessi',
  'Neymar Jr': 'neymarjr', 'Kylian Mbappé': 'k.mbappe',
  'David Beckham': 'davidbeckham', 'LeBron James': 'kingjames',
  'Serena Williams': 'serenawilliams', 'Lewis Hamilton': 'lewishamilton',
  'Tom Brady': 'tombrady', 'Patrick Mahomes': 'patrickmahomes',
  'Virat Kohli': 'virat.kohli', 'MS Dhoni': 'mahi7781',
  'Rohit Sharma': 'rohitsharma45', 'KL Rahul': 'klrahul',
  'Hardik Pandya': 'hardikpandya93', 'Rishabh Pant': 'rishabpant',
  'Usain Bolt': 'usainbolt', 'Conor McGregor': 'thenotoriousmma',
  'Floyd Mayweather': 'floydmayweather', 'Max Verstappen': 'maxverstappen1',

  // ── Models / Fashion Icons ──
  'Kim Kardashian': 'kimkardashian', 'Kylie Jenner': 'kyliejenner',
  'Kendall Jenner': 'kendalljenner', 'Hailey Bieber': 'haileybieber',
  'Bella Hadid': 'bellahadid', 'Gigi Hadid': 'gigihadid',
  'Cara Delevingne': 'caradelevingne', 'Emily Ratajkowski': 'emrata',
  'Chiara Ferragni': 'chiaraferragni', 'Victoria Beckham': 'victoriabeckham',
  'Naomi Campbell': 'naomi', 'Winnie Harlow': 'winnieharlow',
  'Kaia Gerber': 'kaiagerber', 'Adut Akech': 'adutakech',
  'Irina Shayk': 'irinashayk', 'Adriana Lima': 'adrianalima',

  // ── Influencers / Creators ──
  'Emma Chamberlain': 'emmachamberlain', 'Bretman Rock': 'bretmanrock',
  'Lilly Singh': 'lilly', 'Addison Rae': 'addisonraee',
  'Charli D\'Amelio': 'charlidamelio',

  // ── K-Drama / Asian Stars ──
  'Song Hye-kyo': 'kyo1122', 'Lee Min-ho': 'actorleeminho',
  'Park Seo-joon': 'bn_sj2013', 'IU': 'dlwlrma',
  'Suzy': 'skuukzky', 'Jackson Wang': 'jacksonwang852g7',

  // ── Tech / Business ──
  'Elon Musk': 'elonmusk', 'Mark Zuckerberg': 'zuck',
  'Satya Nadella': 'satyanadella',

  // ── International / European ──
  'Giannis Antetokounmpo': 'giannis_an34', 'Zlatan Ibrahimović': 'iamzlatanibrahimovic',
  'Monica Bellucci': 'monicabellucciofficiel', 'Penélope Cruz': 'penelopecruzoficial',
  'Anya Taylor-Joy': 'anyataylorjoy',

  // ── Middle East / Arab ──
  'Mo Salah': 'mosalah', 'DJ Khaled': 'djkhaled',

  // ── African Stars ──
  'Burna Boy': 'burnaboygram', 'Wizkid': 'wizkidayo',
  'Davido': 'davido', 'Tiwa Savage': 'tiwasavage',

  // ── Fashion Designers ──
  'Virgil Abloh': 'virgilabloh', 'Tom Ford': 'tomford',
  'Donatella Versace': 'donatella_versace', 'Marc Jacobs': 'marcjacobs',
  'Alexander Wang': 'alexanderwangny',

  // ── Additional from celebrities.json (batched in one patch) ──
  'Aamir Khan': 'aamirkhanproductions', 'Ananya Panday': 'ananyapanday',
  'Adele': 'adele', 'Anderson .Paak': 'anderson._paak',
  'Angelina Jolie': 'angelinajolie_official', 'Anna Wintour': 'annawintour',
  'Camila Cabello': 'camila_cabello', 'Daniel Craig': 'danielcraig',
  'Denzel Washington': 'denzelwashington', 'Erling Haaland': 'erling.haaland',
  'George Clooney': 'georgeclooney_official', 'Halsey': 'iamhalsey',
  'Henry Cavill': 'henrycavill', 'Jamie Foxx': 'iamjamiefoxx',
  'Jason Statham': 'jasonstatham', 'Jay-Z': 'jayz',
  'Kate Moss': 'katemossagency', 'Lana Del Rey': 'honeymoon',
  'Lewis Capaldi': 'lewiscapaldi', 'Lil Nas X': 'lilnasx',
  'Michael B Jordan': 'michaelbjordan',
  'Mick Jagger': 'mickjagger', 'Mr. Beast': 'mrbeast',
  'Novak Djokovic': 'djokernole', 'Olivia Rodrigo': 'oliviarodrigo',
  'Pedro Pascal': 'pascalispunk', 'PewDiePie': 'pewdiepie',
  'Rafael Nadal': 'rafaelnadal', 'Roger Federer': 'rogerfederer',
  'Sabrina Carpenter': 'sabrinacarpenter', 'Sam Smith': 'samsmith',
  'Scarlett Johansson': 'scarlettjohanssonofficial', 'Shawn Mendes': 'shawnmendes',
  'Stephen Curry': 'stephencurry30', 'Suhana Khan': 'suhanakhan2',
  'Tems': 'temsbaby',

  // Alias entries — same handle as an existing canonical name so the
  // cron can find them however they're spelled in celebrities.json.
  'A$AP Rocky': 'asaprocky',
  'Robert Downey Jr': 'robertdowneyjr',
  'Samuel L Jackson': 'samuelljackson',
  'Tyler, The Creator': 'feliciathegoat',
  'Virushka': 'anushkasharma', // Virat + Anushka; use Anushka's account
};

// Export for the cron + other routes
export const ALL_CELEB_HANDLES = KNOWN_HANDLES;

interface EyewearPhoto {
  id: string;
  imageUrl: string;
  blobUrl?: string;
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
  source: 'instagram' | 'brave' | 'wikimedia' | 'none';
  fetchedAt: string;
  cached: boolean;
  needsSetup?: boolean;
  error?: string;
  hint?: string;
}

const CACHE = new Map<string, { payload: CelebResult; expiresAt: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 1 day

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

/* ═══ 1. Instagram via Apify (PRIMARY) ═══ */

async function fetchInstagramPosts(name: string, handleOverride: string | null, limit: number) {
  const handle = handleOverride || KNOWN_HANDLES[name] || null;
  if (!handle) return { ok: false as const, error: `No IG handle for "${name}". Use ?handle=xxx to specify.`, handle: null, posts: [] as CandidatePhoto[] };
  if (!isApifyConfigured()) return { ok: false as const, error: 'APIFY_TOKEN required for Instagram scanning.', handle, posts: [] as CandidatePhoto[] };

  const result = await runActor<Record<string, unknown>>(DEFAULT_ACTORS.instagram, {
    directUrls: [`https://www.instagram.com/${handle}/`],
    resultsType: 'posts',
    resultsLimit: limit,
    addParentData: false,
  }, { timeout: 50, maxItems: limit });

  if (!result.ok) return { ok: false as const, error: result.error, handle, posts: [] as CandidatePhoto[] };

  const posts: CandidatePhoto[] = result.items
    .filter(p => p.displayUrl)
    .map((p, i) => ({
      id: (p.id as string) || (p.shortCode as string) || `ig_${i}`,
      imageUrl: (p.displayUrl as string),
      thumb: (p.displayUrl as string),
      pageUrl: (p.url as string) || `https://www.instagram.com/p/${p.shortCode}/`,
      source: `@${handle}`,
      title: ((p.caption as string) || '').substring(0, 200),
      caption: (p.caption as string) || '',
      likes: (p.likesCount as number) || 0,
      comments: (p.commentsCount as number) || 0,
      postedAt: (p.timestamp as string) || '',
    }));
  return { ok: true as const, posts, handle };
}

/* ═══ 2. Brave Image Search (free fallback) ═══ */

async function fetchBraveImages(name: string, limit: number): Promise<CandidatePhoto[]> {
  if (!BRAVE_KEY) return [];
  const queries = [`${name} sunglasses`, `${name} wearing glasses`, `${name} eyewear`];
  const all: CandidatePhoto[] = [];
  const seen = new Set<string>();
  for (const q of queries) {
    try {
      const url = new URL('https://api.search.brave.com/res/v1/images/search');
      url.searchParams.set('q', q);
      url.searchParams.set('count', String(Math.min(limit, 20)));
      url.searchParams.set('safesearch', 'off');
      const res = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_KEY },
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const r of (data?.results || []) as Array<Record<string, unknown>>) {
        const props = r.properties as { url?: string } | undefined;
        const thumbObj = r.thumbnail as { src?: string } | undefined;
        const metaUrl = r.meta_url as { hostname?: string } | undefined;
        const img = props?.url || (r.url as string);
        if (!img || seen.has(img)) continue;
        seen.add(img);
        all.push({
          id: `brave_${all.length}`,
          imageUrl: img, thumb: thumbObj?.src || img,
          pageUrl: (r.url as string), source: (r.source as string) || metaUrl?.hostname || 'web',
          title: (r.title as string) || name,
        });
        if (all.length >= limit) break;
      }
      if (all.length >= limit) break;
    } catch { continue; }
  }
  return all;
}

/* ═══ 3. Blob upload — persist images permanently ═══ */

async function uploadToBlob(imageUrl: string, path: string): Promise<string | null> {
  if (!BLOB_TOKEN) return null;
  try {
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 500 || buf.byteLength > 5 * 1024 * 1024) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const blobRes = await fetch(`https://blob.vercel-storage.com/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${BLOB_TOKEN}`,
        'x-api-version': '7',
        'Content-Type': ct,
        'x-content-type': ct,
      },
      body: buf,
    });
    const json = await blobRes.json();
    return (json as { url?: string }).url || null;
  } catch { return null; }
}

/* ═══ 4. Gemini Vision — detect eyewear + extract details ═══ */

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
      return { ...p, base64: Buffer.from(buf).toString('base64'), mime: res.headers.get('content-type') || 'image/jpeg' };
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
        text: `I'm showing you ${slice.length} Instagram photos from a celebrity's account. For EACH photo:
1. Is the person VISIBLY wearing sunglasses or eyeglasses ON THEIR FACE?
2. If yes, describe the eyewear in detail.

Return a compact JSON array:
[{"i":0,"yes":true,"type":"oversized black acetate cat-eye sunglasses with gold temple arms, possibly Versace"},{"i":1,"yes":false}]

Rules:
- yes=true ONLY if eyewear is clearly visible ON the person's face in the photo.
- Eyewear held in hand, pushed up on head, on a table, or worn by someone else = false.
- When yes=true, describe: shape + color + material + lens type + possible brand if recognizable. Max 100 chars.
- Be specific: "round gold metal clear-lens glasses" not just "glasses".
- If you recognize the brand (Ray-Ban, Gucci, Dior, Prada, Oakley, etc.), include it.
- Output ONLY the raw JSON array. No preamble, no code fences.`,
      },
      ...slice.map(v => ({ inlineData: { mimeType: v.mime, data: v.base64 } })),
    ];

    for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
      try {
        const r = await ai.models.generateContent({ model, contents: [{ role: 'user', parts }] });
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

/* ═══ 5. Persist to Supabase + Blob ═══ */

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function persistToDB(
  name: string,
  handle: string | undefined,
  photos: EyewearPhoto[],
  source: CelebResult['source'],
): Promise<void> {
  try {
    const client = supabaseServer();
    const slug = slugify(name);
    const rows = photos.map(p => ({
      id: `${slug}_${p.id}`,
      celeb_name: name,
      celeb_slug: slug,
      celeb_category: null,
      celeb_country: null,
      image_url: p.imageUrl,
      blob_url: p.blobUrl || null,
      thumb_url: p.thumbnail || null,
      page_url: p.pageUrl || null,
      source: p.source,
      source_type: source,
      caption: p.caption?.substring(0, 500) || `${name} wearing ${p.eyewearType}`,
      eyewear_type: p.eyewearType,
      detected_at: new Date().toISOString(),
      likes: p.likes || 0,
      comments: p.comments || 0,
      posted_at: p.postedAt || null,
      vision_confidence: 1,
    }));
    if (rows.length > 0) {
      await client.from('celeb_photos').upsert(rows, { onConflict: 'id', ignoreDuplicates: false });
    }
    // Log
    await client.from('celeb_scan_log').insert({
      celeb_name: name,
      celeb_slug: slug,
      candidates: photos.length,
      detected: photos.length,
      source: source === 'instagram' ? `@${handle}` : source,
    });
  } catch { /* non-fatal */ }
}

/* ═══ Main handler ═══ */

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const name = (searchParams.get('name') || '').trim();
  const handleOverride = searchParams.get('handle');
  const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 50);
  const refresh = searchParams.get('refresh') === '1';

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const cacheKey = `${name.toLowerCase()}:${limit}`;
  if (!refresh) {
    const cached = CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ ...cached.payload, cached: true });
    }
  }

  let candidates: CandidatePhoto[] = [];
  let sourceUsed: CelebResult['source'] = 'none';
  let handle: string | undefined;
  let sourceError = '';

  // ── PRIMARY: Instagram via Apify ──
  if (isApifyConfigured()) {
    const igResult = await fetchInstagramPosts(name, handleOverride, limit);
    handle = igResult.handle || undefined;
    if (igResult.ok && igResult.posts.length > 0) {
      candidates = igResult.posts;
      sourceUsed = 'instagram';
    } else {
      sourceError = igResult.error || '';
    }
  }

  // ── FALLBACK: Brave Image Search (free) ──
  if (candidates.length === 0 && BRAVE_KEY) {
    candidates = await fetchBraveImages(name, limit);
    if (candidates.length > 0) sourceUsed = 'brave';
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      name, handle,
      totalScanned: 0, eyewearCount: 0, photos: [],
      source: 'none', fetchedAt: new Date().toISOString(), cached: false,
      needsSetup: !isApifyConfigured(),
      error: sourceError || 'No posts found.',
      hint: !isApifyConfigured()
        ? 'Set APIFY_TOKEN to scan real Instagram posts. This is the primary path for celeb eyewear detection.'
        : 'No IG handle found for this celebrity. Try ?handle=theirhandle.',
    });
  }

  // ── Gemini Vision filter ──
  const detected = await detectEyewearBatch(
    candidates.map(c => ({ id: c.id, imageUrl: c.imageUrl }))
  );

  // ── Upload confirmed eyewear photos to Blob ──
  const eyewearCandidates = candidates.filter(c => detected.has(c.id));
  const photos: EyewearPhoto[] = [];

  for (const c of eyewearCandidates) {
    let blobUrl: string | null = null;
    if (BLOB_TOKEN) {
      const blobPath = `celeb/${slugify(name)}/${c.id}.jpg`;
      blobUrl = await uploadToBlob(c.imageUrl, blobPath);
    }
    photos.push({
      id: c.id,
      imageUrl: blobUrl || c.imageUrl,
      blobUrl: blobUrl || undefined,
      thumbnail: blobUrl || c.thumb,
      pageUrl: c.pageUrl,
      source: c.source,
      caption: c.caption || c.title,
      eyewearType: detected.get(c.id) || 'eyewear',
      likes: c.likes,
      comments: c.comments,
      postedAt: c.postedAt,
    });
  }

  // ── Persist to DB ──
  await persistToDB(name, handle, photos, sourceUsed);

  const payload: CelebResult = {
    name, handle,
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
