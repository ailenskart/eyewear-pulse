import { NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase';
import { embedTextsBatched } from '@/lib/embeddings/openai';
import { env } from '@/lib/env';
import { ok, fail, withHandler, validateQuery } from '@/lib/api';

/**
 * Backfill text embeddings for products.
 *
 * Takes N unembedded products (by brand_content.id), embeds their text,
 * writes to product_embeddings. Idempotent — skips rows already embedded.
 *
 *   GET /api/v1/embeddings/backfill?key=CRON_SECRET&limit=500
 *
 * Cost estimate: OpenAI text-embedding-3-small is $0.02 per 1M tokens.
 * Average product text is ~30 tokens. 52,000 products ≈ 1.5M tokens ≈ $0.03.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const querySchema = z.object({
  key: z.string(),
  limit: z.coerce.number().int().min(1).max(2000).optional().default(500),
});

export const GET = withHandler('v1.embeddings.backfill', async (request: NextRequest) => {
  const v = validateQuery(request, querySchema);
  if (!v.ok) return v.response;
  const { key, limit } = v.data;
  if (key !== env.CRON_SECRET()) return fail('unauthorized', 401);
  if (!process.env.OPENAI_API_KEY) return fail('OPENAI_API_KEY required', 500);

  const client = supabaseServer();

  // Find products missing from product_embeddings
  const { data: todo, error } = await client.rpc('products_needing_embedding', { limit_count: limit }).maybeSingle();
  // Fallback if RPC doesn't exist: raw query
  let products: Array<{ id: number; brand_id: number | null; title: string | null; description: string | null; product_type: string | null }>;
  if (error || !todo) {
    const res = await client
      .from('brand_content')
      .select('id,brand_id,title,description,product_type,tags')
      .eq('type', 'product')
      .eq('is_active', true)
      .not('id', 'in', `(select brand_content_id from product_embeddings)`)
      .limit(limit);
    products = (res.data || []) as Array<{ id: number; brand_id: number | null; title: string | null; description: string | null; product_type: string | null }>;
  } else {
    products = todo as Array<{ id: number; brand_id: number | null; title: string | null; description: string | null; product_type: string | null }>;
  }

  if (products.length === 0) {
    return ok({ embedded: 0, message: 'No products needing embeddings.' });
  }

  // Build embedding text: title + description + product_type
  const texts = products.map(p => [p.title, p.description, p.product_type].filter(Boolean).join(' · '));

  const vectors = await embedTextsBatched(texts, 100);

  // Insert in batches of 500
  const rows = products.map((p, i) => ({
    brand_content_id: p.id,
    brand_id: p.brand_id,
    embedding: vectors[i],
    model: 'openai-text-embedding-3-small',
  }));
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error: insErr } = await client.from('product_embeddings').upsert(slice, { onConflict: 'brand_content_id' });
    if (insErr) {
      return fail(`Insert failed: ${insErr.message}`, 500);
    }
    inserted += slice.length;
  }

  return ok({
    embedded: inserted,
    remaining_estimate: 'run again with same limit to continue',
  });
});
