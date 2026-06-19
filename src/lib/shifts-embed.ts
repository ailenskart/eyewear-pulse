/**
 * Shared image-embedding backfill for the Shifts visual index.
 *
 * One pass: find brand_content rows of `type` that have an image but no
 * CLIP embedding yet, embed them via Replicate, store in
 * content_image_embeddings. Used by both the manual endpoint
 * (/api/shifts/embed) and the cron (/api/cron/shifts-index).
 */

import { supabaseServer } from '@/lib/supabase';
import { env } from '@/lib/env';
import { embedImagesClip, CLIP_MODEL } from '@/lib/embeddings/clip';

interface Row {
  id: number;
  brand_handle: string | null;
  image_url: string | null;
  blob_url: string | null;
  data: Record<string, unknown> | null;
}

const bestImage = (r: Row): string =>
  r.blob_url || (r.data?.display_url as string) || r.image_url || (r.data?.product_image as string) || '';

export interface EmbedPassResult {
  scanned: number;
  embedded: number;
  failed: number;
  /** True when this pass filled its whole batch — more rows likely remain. */
  hadMore: boolean;
}

export async function embedPendingBatch(type: string, limit: number): Promise<EmbedPassResult> {
  const client = supabaseServer();

  const { data: doneRows } = await client
    .from('content_image_embeddings')
    .select('content_id')
    .eq('ctype', type)
    .limit(100000);
  const done = new Set((doneRows || []).map(r => (r as { content_id: number }).content_id));

  const { data: rows } = await client
    .from('brand_content')
    .select('id, brand_handle, image_url, blob_url, data')
    .eq('type', type)
    .order('id', { ascending: false })
    .limit(limit + done.size);

  const todo = ((rows as unknown as Row[]) || [])
    .filter(r => !done.has(r.id) && bestImage(r))
    .slice(0, limit);

  if (todo.length === 0) return { scanned: 0, embedded: 0, failed: 0, hadMore: false };

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
    const { error } = await client.from('content_image_embeddings').upsert(inserts, { onConflict: 'content_id' });
    if (!error) embedded = inserts.length;
  }

  return { scanned: todo.length, embedded, failed: todo.length - embedded, hadMore: todo.length >= limit };
}
