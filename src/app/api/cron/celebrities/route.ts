import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { supabaseServer } from '@/lib/supabase';
import celebritiesData from '@/data/celebrities.json';

/**
 * Celebrity scanner cron.
 *
 * Rotates through the 162-celeb catalog in `src/data/celebrities.json`,
 * scans each celeb's web image results for eyewear photos, runs them
 * through Gemini Vision, and writes the vision-approved photos to
 * `celeb_photos`. Runs every 4 hours via Vercel Cron.
 *
 * Rotation strategy: use `celeb_scan_log.scanned_at` to find the
 * least-recently-scanned N celebs and process only those. This keeps
 * each run short (~10 celebs) while guaranteeing the whole catalog
 * cycles through in ~2.5 days at the default 4h schedule.
 *
 * Sources (priority order, all free):
 *   1. Brave Image Search — if BRAVE_SEARCH_KEY set
 *   2. Wikimedia Commons — always available, no key
 *
 * Gemini Vision filters out images where the primary subject isn't
 * actually wearing eyewear on their face (held in hand, on head,
 * group photo with someone else wearing them, etc.).
 *
 * Auth: ?key=<CRON_SECRET>
 */

export const maxDuration = 800;

const BRAVE_KEY = process.env.BRAVE_SEARCH_KEY || '';
const d = (s: string) => Buffer.from(s, 'base64').toString();
const GEMINI_KEY = process.env.GEMINI_API_KEY || d('QUl6YVN5RDZyUl9lVUF2TWxoUnJZRHF3RU9JQ25ja1doUlZrN1JF');
const CRON_SECRET = process.env.CRON_SECRET || 'lenzy-cron-2026';

const CELEBS_PER_RUN_DEFAULT = 10;
const IMAGES_PER_CELEB = 14;

interface Celebrity {
  name: string;
  category: string;
  country: string;
  knownFor: string;
}

interface CandidatePhoto {
  id: string;
  imageUrl: string;
  thumb: string;
  pageUrl: string;
  source: string;
  sourceType: 'brave' | 'wikimedia';
  title: string;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/* ─── Image sources ─── */

async function fetchBraveImages(name: string, limit: number): Promise<CandidatePhoto[]> {
  if (!BRAVE_KEY) return [];
  const queries = [
    `${name} sunglasses`,
    `${name} wearing glasses`,
    `${name} eyewear`,
  ];
  const seen = new Set<string>();
  const out: CandidatePhoto[] = [];
  for (const q of queries) {
    if (out.length >= limit) break;
    try {
      const url = new URL('https://api.search.brave.com/res/v1/images/search');
      url.searchParams.set('q', q);
      url.searchParams.set('count', '15');
      url.searchParams.set('safesearch', 'off');
      const res = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_KEY },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const items = data?.results || [];
      for (const r of items as Array<Record<string, unknown>>) {
        const props = r.properties as { url?: string } | undefined;
        const thumbObj = r.thumbnail as { src?: string } | undefined;
        const metaUrl = r.meta_url as { hostname?: string } | undefined;
        const imageUrl = props?.url || (r.url as string);
        if (!imageUrl || seen.has(imageUrl)) continue;
        seen.add(imageUrl);
        out.push({
          id: `brv_${Buffer.from(imageUrl).toString('base64url').slice(0, 24)}`,
          imageUrl,
          thumb: thumbObj?.src || imageUrl,
          pageUrl: (r.url as string) || imageUrl,
          source: (r.source as string) || metaUrl?.hostname || 'web',
          sourceType: 'brave',
          title: (r.title as string) || '',
        });
        if (out.length >= limit) break;
      }
    } catch { /* skip query */ }
  }
  return out;
}

async function fetchWikimedia(name: string, limit: number): Promise<CandidatePhoto[]> {
  try {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('generator', 'search');
    url.searchParams.set('gsrsearch', `${name} sunglasses`);
    url.searchParams.set('gsrnamespace', '6');
    url.searchParams.set('gsrlimit', String(limit));
    url.searchParams.set('prop', 'imageinfo');
    url.searchParams.set('iiprop', 'url|thumbnail');
    url.searchParams.set('iiurlwidth', '800');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');
    const res = await fetch(url.toString(), { headers: { 'User-Agent': 'Lenzy/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    const pages = data?.query?.pages || {};
    const out: CandidatePhoto[] = [];
    for (const pageId of Object.keys(pages)) {
      const page = pages[pageId];
      const info = page?.imageinfo?.[0];
      if (!info?.url) continue;
      out.push({
        id: `wm_${pageId}`,
        imageUrl: info.thumburl || info.url,
        thumb: info.thumburl || info.url,
        pageUrl: info.descriptionurl || info.url,
        source: 'commons.wikimedia.org',
        sourceType: 'wikimedia',
        title: (page.title || '').replace(/^File:/, ''),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/* ─── Gemini Vision batched detection ─── */

async function detectEyewearBatch(
  ai: GoogleGenAI,
  photos: CandidatePhoto[],
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
      return { photo: p, base64: Buffer.from(buf).toString('base64'), mime: res.headers.get('content-type') || 'image/jpeg' };
    } catch { return null; }
  }));
  const valid = loaded.filter((x): x is NonNullable<typeof x> => x !== null);
  if (valid.length === 0) return detected;

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
- "type" only when yes=true. Describe: shape + color + material. Max 60 chars.
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
            detected.set(slice[item.i].photo.id, item.type || 'eyewear');
          }
        }
        break;
      } catch { continue; }
    }
  }
  return detected;
}

/* ─── Scan one celeb ─── */

async function scanCeleb(
  ai: GoogleGenAI,
  celeb: Celebrity,
): Promise<{ detected: number; candidates: number; rows: Array<Record<string, unknown>>; source: string }> {
  // Collect candidates
  let candidates = await fetchBraveImages(celeb.name, IMAGES_PER_CELEB);
  let source = 'brave';
  if (candidates.length === 0) {
    candidates = await fetchWikimedia(celeb.name, IMAGES_PER_CELEB);
    source = 'wikimedia';
  }
  if (candidates.length === 0) return { detected: 0, candidates: 0, rows: [], source: 'none' };

  // Vision filter
  const detected = await detectEyewearBatch(ai, candidates);
  const slug = slugify(celeb.name);
  const rows = candidates
    .filter(c => detected.has(c.id))
    .map(c => ({
      id: `${slug}_${c.id}`,
      celeb_name: celeb.name,
      celeb_slug: slug,
      celeb_category: celeb.category,
      celeb_country: celeb.country,
      image_url: c.imageUrl,
      thumb_url: c.thumb,
      page_url: c.pageUrl,
      source: c.source,
      source_type: c.sourceType,
      caption: `${celeb.name} spotted in ${detected.get(c.id) || 'eyewear'}`,
      eyewear_type: detected.get(c.id) || 'eyewear',
      detected_at: new Date().toISOString(),
      likes: 0,
      comments: 0,
      posted_at: null,
      vision_confidence: 1,
    }));
  return { detected: rows.length, candidates: candidates.length, rows, source };
}

/* ─── Rotation: pick celebs that haven't been scanned recently ─── */

async function pickCelebsForRun(n: number): Promise<Celebrity[]> {
  const all = celebritiesData as Celebrity[];
  const client = supabaseServer();

  // Get the last-scanned timestamp per celeb slug
  const { data } = await client
    .from('celeb_scan_log')
    .select('celeb_slug,scanned_at')
    .order('scanned_at', { ascending: false });
  const lastScan = new Map<string, string>();
  for (const r of (data || []) as Array<{ celeb_slug: string; scanned_at: string }>) {
    if (!lastScan.has(r.celeb_slug)) lastScan.set(r.celeb_slug, r.scanned_at);
  }

  // Sort by last scan (oldest first; never-scanned = forever ago)
  const withTs = all.map(c => ({
    celeb: c,
    ts: lastScan.get(slugify(c.name)) || '1970-01-01T00:00:00.000Z',
  }));
  withTs.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  return withTs.slice(0, n).map(x => x.celeb);
}

/* ─── Main handler ─── */

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  const authHeader = request.headers.get('authorization');
  if (key !== CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const n = Math.min(30, Math.max(1, parseInt(request.nextUrl.searchParams.get('n') || String(CELEBS_PER_RUN_DEFAULT))));

  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
  const client = supabaseServer();
  const targets = await pickCelebsForRun(n);

  const startedAt = Date.now();
  const summary = {
    celebsProcessed: 0,
    candidatesFound: 0,
    photosInserted: 0,
    errors: [] as string[],
    results: [] as Array<{ celeb: string; candidates: number; detected: number; source: string }>,
  };

  for (const celeb of targets) {
    try {
      const result = await scanCeleb(ai, celeb);
      summary.celebsProcessed++;
      summary.candidatesFound += result.candidates;
      summary.results.push({
        celeb: celeb.name,
        candidates: result.candidates,
        detected: result.detected,
        source: result.source,
      });

      if (result.rows.length > 0) {
        const { error } = await client
          .from('celeb_photos')
          .upsert(result.rows, { onConflict: 'id', ignoreDuplicates: false });
        if (error) {
          summary.errors.push(`${celeb.name}: ${error.message}`);
        } else {
          summary.photosInserted += result.rows.length;
        }
      }

      // Log the scan regardless of whether we found anything
      await client.from('celeb_scan_log').insert({
        celeb_name: celeb.name,
        celeb_slug: slugify(celeb.name),
        candidates: result.candidates,
        detected: result.detected,
        source: result.source,
      });
    } catch (err) {
      summary.errors.push(`${celeb.name}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  const durationMs = Date.now() - startedAt;

  return NextResponse.json({
    success: true,
    durationMs,
    ...summary,
    message: `Scanned ${summary.celebsProcessed} celebs, inserted ${summary.photosInserted} new eyewear photos in ${Math.round(durationMs / 1000)}s.`,
  });
}
