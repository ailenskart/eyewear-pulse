import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { downloadMedia, uploadToBlob } from '@/lib/blob';
import { env } from '@/lib/env';

/**
 * Blob-URL backfill for rows already in `brand_content`.
 *
 * The feed prefers `blob_url` over `image_url` (src/lib/feed-db.ts).
 * Posts scraped before BLOB_READ_WRITE_TOKEN was consistently wired
 * have `blob_url = NULL` and only an expiring Instagram CDN URL in
 * `image_url`, so the rendered card shows a broken image once the CDN
 * signature expires.
 *
 * This endpoint walks `brand_content` in small batches, downloads each
 * row's source image, uploads to Vercel Blob, and patches `blob_url`
 * on the row. Idempotent — skips rows that already have `blob_url`.
 *
 * Auth: ?key=<CRON_SECRET>
 *
 *   GET /api/admin/backfill-blobs?key=xxx&type=ig_post&limit=200
 *
 * Recommended invocation: loop with ?offset= in 200-row chunks; each
 * call processes rows in parallel with a small concurrency window.
 */

export const maxDuration = 800;

const CRON_SECRET = process.env.CRON_SECRET || 'lenzy-cron-2026';
const CONCURRENCY = 4;

interface Row {
  id: number | string;
  source_ref: string | null;
  image_url: string | null;
  video_url: string | null;
  blob_url: string | null;
  type: string;
}

async function pMapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
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

  const type = request.nextUrl.searchParams.get('type') || 'ig_post';
  const limit = Math.min(500, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '100')));
  const offset = Math.max(0, parseInt(request.nextUrl.searchParams.get('offset') || '0'));

  const client = supabaseServer();
  const { data, error, count } = await client
    .from('brand_content')
    .select('id,source_ref,image_url,video_url,blob_url,type', { count: 'exact' })
    .eq('type', type)
    .is('blob_url', null)
    .not('image_url', 'is', null)
    .order('posted_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data || []) as Row[];

  const startedAt = Date.now();
  const results = { candidates: rows.length, uploaded: 0, patched: 0, skipped: 0, failed: 0 };

  const outcomes = await pMapLimit(rows, CONCURRENCY, async (r) => {
    if (!r.image_url) { results.skipped++; return null; }
    const pid = r.source_ref || String(r.id);
    const buf = await downloadMedia(r.image_url);
    if (!buf) { results.failed++; return null; }
    const blobUrl = await uploadToBlob(buf, `posts/${pid}.jpg`, 'image/jpeg');
    if (!blobUrl) { results.failed++; return null; }
    results.uploaded++;
    return { id: r.id, blob_url: blobUrl };
  });

  const patches = outcomes.filter((x): x is { id: number | string; blob_url: string } => !!x);
  if (patches.length > 0) {
    // One UPDATE per row — still well under 60rpm Mindcase-style limits
    // and Supabase handles single-row updates in ~10–20ms each.
    for (const p of patches) {
      const { error: upErr } = await client
        .from('brand_content')
        .update({ blob_url: p.blob_url })
        .eq('id', p.id);
      if (!upErr) results.patched++;
    }
  }

  return NextResponse.json({
    success: true,
    type,
    offset,
    limit,
    totalCandidates: count ?? rows.length,
    durationMs: Date.now() - startedAt,
    ...results,
    nextOffset: rows.length === limit ? offset + limit : null,
  });
}
