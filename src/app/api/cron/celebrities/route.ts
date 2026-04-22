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

// Import the full handle list dynamically to avoid circular deps
async function getCelebList(): Promise<Array<{ name: string; handle: string }>> {
  // Import the handle map from the scanner route
  try {
    const { ALL_CELEB_HANDLES } = await import('@/app/api/celebrities/instagram/route');
    return Object.entries(ALL_CELEB_HANDLES).map(([name, handle]) => ({ name, handle }));
  } catch {
    return [];
  }
}

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
  withTs.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  return withTs.slice(0, n);
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  const authHeader = request.headers.get('authorization');
  if (key !== CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const n = Math.min(20, Math.max(1, parseInt(request.nextUrl.searchParams.get('n') || '8')));
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
