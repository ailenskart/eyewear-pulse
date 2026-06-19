import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { env, hasEnv } from '@/lib/env';
import { embedImagesClip, CLIP_MODEL } from '@/lib/embeddings/clip';

/**
 * Image-embedding backfill for the Shifts visual index.
 *
 * Walks brand_content rows of a given type that have an image but no CLIP
 * embedding yet, embeds them via Replicate, and stores the vector in
 * content_image_embeddings. Idempotent and resumable — call repeatedly
 * (or on a cron) until `remaining` hits 0.
 *
 * Auth: ?key=<CRON_SECRET> OR Authorization: Bearer <CRON_SECRET>
 *
 *   GET /api/shifts/embed?key=xxx&type=ig_post&limit=120
 *   GET /api/shifts/embed?key=xxx&type=product&limit=200
 */

export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET || 'lenzy-cron-2026';

interface Row {
  id: number;
  brand_handle: string | null;
  image_url: string | null;
  blob_url: string | null;
  data: Record<string, unknown> | null;
}

function bestImage(r: Row): string {
  return r.blob_url || (r.data?.display_url as string) || r.image_url || (r.data?.product_image as string) || '';
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  const authHeader = request.headers.get('authorization');
  if (key !== CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasEnv('REPLICATE_API_TOKEN')) {
    return NextResponse.json({ error: 'REPLICATE_API_TOKEN not set' }, { status: 400 });
  }

  const type = request.nextUrl.searchParams.get('type') || 'ig_post';
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '120'), 400);
  const client = supabaseServer();

  // Ids already embedded, so we can skip them.
  const { data: doneRows } = await client
    .from('content_image_embeddings')
    .select('content_id')
    .eq('ctype', type)
    .limit(100000);
  const done = new Set((doneRows || []).map(r => (r as { content_id: number }).content_id));

  // Candidate rows (over-fetch, then filter out the already-embedded).
  const { data: rows, error } = await client
    .from('brand_content')
    .select('id, brand_handle, image_url, blob_url, data')
    .eq('type', type)
    .order('id', { ascending: false })
    .limit(limit + done.size);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const todo = (rows as unknown as Row[] || [])
    .filter(r => !done.has(r.id) && bestImage(r))
    .slice(0, limit);

  if (todo.length === 0) {
    return NextResponse.json({ type, embedded: 0, remaining: 0, alreadyDone: done.size });
  }

  const vectors = await embedImagesClip(
    todo.map(r => ({ id: String(r.id), url: bestImage(r) })),
    env.REPLICATE_API_TOKEN(),
  );

  const inserts = todo
    .filter(r => vectors.has(String(r.id)))
    .map(r => ({
      content_id: r.id,
      brand_handle: r.brand_handle,
      ctype: type,
      embedding: vectors.get(String(r.id))!,
      model: CLIP_MODEL,
    }));

  let embedded = 0;
  if (inserts.length > 0) {
    const { error: upErr } = await client
      .from('content_image_embeddings')
      .upsert(inserts, { onConflict: 'content_id' });
    if (upErr) return NextResponse.json({ error: upErr.message, embedded }, { status: 500 });
    embedded = inserts.length;
  }

  return NextResponse.json({
    type,
    scanned: todo.length,
    embedded,
    failed: todo.length - embedded,
    alreadyDone: done.size + embedded,
  });
}
