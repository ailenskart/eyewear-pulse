import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Celebrity Instagram cron — scans real IG accounts via the
 * /api/celebrities/instagram endpoint, which uses Apify to pull
 * recent posts and Gemini Vision to filter for eyewear.
 *
 * Rotation: picks the N least-recently-scanned celebs from
 * celeb_scan_log so the full catalog cycles through evenly.
 *
 * Each celeb scan: Apify scrapes their IG → Gemini Vision filters
 * for eyewear → Blob upload → celeb_photos DB persist.
 *
 * Auth: ?key=<CRON_SECRET>
 * Params: ?n=10 (celebs per run)
 *
 * Schedule: every 4 hours via vercel.json
 */

export const maxDuration = 800;

const CRON_SECRET = process.env.CRON_SECRET || 'lenzy-cron-2026';

// Pull the celebrity list from the Supabase `celebrities` table when
// it's been populated (v9 bundle — 3,006 IG-handle'd celebs). Fall
// back to the hardcoded KNOWN_HANDLES map so a fresh deploy that
// hasn't run the import yet still has something to scan.
async function getCelebList(): Promise<Array<{ name: string; handle: string; eyewearAffinity?: string | null }>> {
  try {
    const client = supabaseServer();
    const { data } = await client
      .from('celebrities')
      .select('name,instagram_handle,eyewear_affinity,instagram_followers')
      .not('instagram_handle', 'is', null)
      .order('instagram_followers', { ascending: false, nullsFirst: false })
      .limit(5000);
    const dbRows = (data || []) as Array<{ name: string; instagram_handle: string; eyewear_affinity: string | null; instagram_followers: number | null }>;
    if (dbRows.length > 0) {
      return dbRows
        .filter(r => r.instagram_handle && r.instagram_handle.trim())
        .map(r => ({
          name: r.name,
          handle: r.instagram_handle.toLowerCase().replace(/^@/, ''),
          eyewearAffinity: r.eyewear_affinity,
        }));
    }
  } catch {
    /* fall back to hardcoded map */
  }
  try {
    const { ALL_CELEB_HANDLES } = await import('@/app/api/celebrities/instagram/route');
    return Object.entries(ALL_CELEB_HANDLES).map(([name, handle]) => ({ name, handle }));
  } catch {
    return [];
  }
}

/**
 * Pick a batch of celebs to scan. Strategy:
 *   • Take the least-recently-scanned 2N (so new celebs + stale
 *     celebs get priority)
 *   • Randomly sample N from that pool → keeps ordering fresh,
 *     surfaces different celebs each run instead of always scanning
 *     the same top-of-queue.
 *   • Also picks up celebs from the v9 `celebrities` table with real
 *     IG handles via getCelebList, so we cycle through all 3,006
 *     over time instead of the old 180 hardcoded ones.
 */
async function pickCelebsForRun(n: number): Promise<Array<{ name: string; handle: string }>> {
  const all = await getCelebList();
  if (all.length === 0) return [];

  const client = supabaseServer();
  const { data } = await client
    .from('celeb_scan_log')
    .select('celeb_slug,scanned_at')
    .order('scanned_at', { ascending: false });

  const lastScan = new Map<string, string>();
  for (const r of (data || []) as Array<{ celeb_slug: string; scanned_at: string }>) {
    if (!lastScan.has(r.celeb_slug)) lastScan.set(r.celeb_slug, r.scanned_at);
  }

  function slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  const withTs = all.map(c => ({
    ...c,
    ts: lastScan.get(slugify(c.name)) || '1970-01-01T00:00:00.000Z',
  }));
  // Least recently scanned first
  withTs.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  // Take 2N stalest, then randomly sample N — gives ordering freshness
  // and avoids always scanning the same handful.
  const pool = withTs.slice(0, Math.max(n * 2, n + 10));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  const authHeader = request.headers.get('authorization');
  if (key !== CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Default n bumped from 8 to 25 — Vercel's 800s wall easily fits a
  // ~20-celeb scan (each celeb is ~20-30s Apify + ~10-20s Moondream
  // for eyewear photos). Raise via ?n=30 for manual sweeps.
  const n = Math.min(50, Math.max(1, parseInt(request.nextUrl.searchParams.get('n') || '25')));
  const targets = await pickCelebsForRun(n);

  if (targets.length === 0) {
    return NextResponse.json({ error: 'No celeb handles available. Check the KNOWN_HANDLES map.' }, { status: 500 });
  }

  // Use the incoming request's origin (always matches the public hostname
  // the cron was called with — e.g. https://lenzy.studio) rather than
  // VERCEL_URL, which points at an internal per-deployment URL that
  // sometimes returns a Next 404 shell when called cross-host.
  const origin = request.nextUrl.origin;

  const startedAt = Date.now();
  const summary = {
    celebsProcessed: 0,
    totalScanned: 0,
    eyewearFound: 0,
    errors: [] as string[],
    results: [] as Array<{ name: string; handle: string; scanned: number; eyewear: number; source: string }>,
  };

  for (const celeb of targets) {
    try {
      // Call our own scanner endpoint — it handles Apify + Vision + Blob + DB
      const url = `${origin}/api/celebrities/instagram?name=${encodeURIComponent(celeb.name)}&handle=${encodeURIComponent(celeb.handle)}&limit=30`;
      const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
      const text = await res.text();
      let data: { totalScanned?: number; eyewearCount?: number; source?: string; error?: string } = {};
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`non-JSON response (${res.status}): ${text.slice(0, 120)}`);
      }
      if (data.error) throw new Error(data.error);

      summary.celebsProcessed++;
      summary.totalScanned += data.totalScanned || 0;
      summary.eyewearFound += data.eyewearCount || 0;
      summary.results.push({
        name: celeb.name,
        handle: celeb.handle,
        scanned: data.totalScanned || 0,
        eyewear: data.eyewearCount || 0,
        source: data.source || 'none',
      });
    } catch (err) {
      summary.errors.push(`${celeb.name}: ${err instanceof Error ? err.message : 'timeout'}`);
    }
  }

  return NextResponse.json({
    success: true,
    durationMs: Date.now() - startedAt,
    ...summary,
    message: `Scanned ${summary.celebsProcessed} celebs' Instagram, found ${summary.eyewearFound} eyewear posts from ${summary.totalScanned} total posts.`,
  });
}
