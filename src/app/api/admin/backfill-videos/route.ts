import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { downloadMedia, uploadToBlob, fetchIgVideoUrl } from '@/lib/blob';
import { env } from '@/lib/env';

/**
 * Video blob backfill for Video/Reel rows already in `brand_content`
 * that lack a blob-hosted MP4.
 *
 * Mindcase's scrape only gives us the thumbnail + engagement counts —
 * no MP4 URL. The Mindcase cron recovers video URLs at ingest time
 * via /api/ig-extract-video, but that hasn't run on historical rows.
 * This endpoint walks those rows, scrapes the IG embed page, uploads
 * the MP4 to Vercel Blob, and patches the row.
 *
 * Auth: ?key=<CRON_SECRET>
 *
 *   GET /api/admin/backfill-videos?key=xxx&limit=20&offset=0
 *
 * Recommended loop: limit=20, offset increments until nextOffset is
 * null. Keep limit modest — each row involves ≥2 IG fetches + an MP4
 * download, so a batch of 20 averages ~60–120s.
 */

export const maxDuration = 800;

const CRON_SECRET = process.env.CRON_SECRET || 'lenzy-cron-2026';
const MAX_VIDEO_MB = 20;
const CONCURRENCY = 2; // IG rate-limits aggressively — keep low.

interface Row {
  id: number | string;
  source_ref: string | null;
  url: string | null;          // IG permalink (has shortCode)
  image_url: string | null;
  video_url: string | null;
  blob_url: string | null;     // image blob
  data: Record<string, unknown> | null;
}

function shortCodeFromUrl(u: string | null): string | null {
  if (!u) return null;
  // https://www.instagram.com/p/DW6rOrpDlpB/   OR   .../reel/XXX/
  const m = u.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return m?.[1] || null;
}

async function pMapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (key !== CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!env.BLOB_READ_WRITE_TOKEN()) {
    return NextResponse.json({ error: 'BLOB_READ_WRITE_TOKEN not set' }, { status: 500 });
  }

  const limit = Math.min(200, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '20')));
  const offset = Math.max(0, parseInt(request.nextUrl.searchParams.get('offset') || '0'));
  const handle = request.nextUrl.searchParams.get('handle') || null;

  const client = supabaseServer();
  // Only rows where the post is a video (Reel/Video type) and we
  // don't yet have a blob-hosted MP4 stored in data.video_blob_url.
  let q = client
    .from('brand_content')
    .select('id,source_ref,url,image_url,video_url,blob_url,data', { count: 'exact' })
    .eq('type', 'ig_post')
    .in('data->>post_type', ['Video', 'Reel'])
    .is('video_url', null)
    .order('posted_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);
  if (handle) q = q.eq('brand_handle', handle.toLowerCase());

  const { data, error, count } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data || []) as Row[];

  const startedAt = Date.now();
  const results = { candidates: rows.length, extracted: 0, downloaded: 0, patched: 0, failed: 0 };

  const outcomes = await pMapLimit(rows, CONCURRENCY, async (r) => {
    const shortCode = shortCodeFromUrl(r.url);
    if (!shortCode) { results.failed++; return null; }
    const videoUrl = await fetchIgVideoUrl(shortCode).catch(() => null);
    if (!videoUrl) { results.failed++; return null; }
    results.extracted++;
    const buf = await downloadMedia(videoUrl);
    if (!buf || buf.byteLength > MAX_VIDEO_MB * 1024 * 1024) { results.failed++; return null; }
    results.downloaded++;
    const pid = r.source_ref || String(r.id);
    const blobUrl = await uploadToBlob(buf, `posts/video_${pid}.mp4`, 'video/mp4');
    if (!blobUrl) { results.failed++; return null; }
    return { id: r.id, video_url: blobUrl, data: { ...(r.data || {}), video_blob_url: blobUrl } };
  });

  const patches = outcomes.filter((x): x is { id: number | string; video_url: string; data: Record<string, unknown> } => !!x);
  for (const p of patches) {
    const { error: upErr } = await client
      .from('brand_content')
      .update({ video_url: p.video_url, data: p.data })
      .eq('id', p.id);
    if (!upErr) results.patched++;
  }

  return NextResponse.json({
    success: true,
    offset,
    limit,
    totalCandidates: count ?? rows.length,
    durationMs: Date.now() - startedAt,
    ...results,
    nextOffset: rows.length === limit ? offset + limit : null,
  });
}
