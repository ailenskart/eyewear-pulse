import { NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase';
import { embedTexts } from '@/lib/embeddings/openai';
import { ok, fail, withHandler, validateQuery } from '@/lib/api';

/**
 * Product similarity search via pgvector.
 *
 *   GET /api/v1/similar?id=12345         find products similar to this one
 *   GET /api/v1/similar?q=tortoise+cat-eye    search by text
 *
 * Returns top-N nearest neighbours by cosine distance.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const querySchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  q: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(12),
}).refine(v => v.id || v.q, { message: 'id or q required' });

export const GET = withHandler('v1.similar', async (request: NextRequest) => {
  const v = validateQuery(request, querySchema);
  if (!v.ok) return v.response;
  const { id, q, limit } = v.data;
  const client = supabaseServer();

  let queryEmbedding: number[] | null = null;

  if (id) {
    const { data } = await client
      .from('product_embeddings')
      .select('embedding')
      .eq('brand_content_id', id)
      .maybeSingle();
    if (!data) return fail('This product has no embedding yet. Run /api/v1/embeddings/backfill first.', 404);
    queryEmbedding = (data as { embedding: number[] }).embedding;
  } else if (q) {
    if (!process.env.OPENAI_API_KEY) return fail('OPENAI_API_KEY required for text search', 500);
    const vectors = await embedTexts([q]);
    queryEmbedding = vectors[0];
  }

  if (!queryEmbedding) return fail('No embedding available', 500);

  // Use Postgres raw SQL via RPC or direct select with vector operator
  const { data: neighbours, error } = await client.rpc('product_similarity_search', {
    query_embedding: queryEmbedding,
    match_count: limit,
  });

  if (error) {
    // Fallback: use the brand_content_id approach with a direct query
    return fail(`pgvector query failed: ${error.message}. Make sure the RPC function exists.`, 500);
  }

  return ok({
    query: id ? { id } : { q },
    results: neighbours || [],
  });
});
