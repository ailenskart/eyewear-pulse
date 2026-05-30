/**
 * supabase-server.ts — Server-side Supabase client factory for vision pipeline
 *
 * Purpose: Creates singleton Supabase clients for server-side usage.
 *   - supabaseServer() → service-role client (bypasses RLS; for cron writers)
 *   - supabaseAnon()   → anon client (respects RLS; for route handlers)
 *
 * This follows the same pattern as /tmp/eyewear-pulse/src/lib/supabase.ts
 * but enforces strict env var validation and removes hardcoded fallbacks.
 *
 * Env vars required:
 *   SUPABASE_URL               — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — Service role key (server-only, NEVER expose to client)
 *   SUPABASE_KEY               — Anon key (safe for client use with RLS)
 *
 * Example invocation:
 *   import { supabaseServer } from '@/lib/supabase/server';
 *   const db = supabaseServer();
 *   const { data } = await db.from('brand_content').select('*').limit(10);
 *
 * Cron schedule: used by all cron pipeline steps
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Env validation — fail fast, no silent fallbacks
// ---------------------------------------------------------------------------

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) {
    throw new Error(
      'supabase-server: SUPABASE_URL is not set. ' +
        'Add it to your Vercel environment variables.',
    );
  }
  if (!url.startsWith('https://')) {
    throw new Error('supabase-server: SUPABASE_URL must start with https://');
  }
  return url;
}

function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'supabase-server: SUPABASE_SERVICE_ROLE_KEY is not set. ' +
        'This key is required for cron writers. ' +
        'NEVER expose this key to the browser.',
    );
  }
  return key;
}

function getAnonKey(): string {
  const key = process.env.SUPABASE_KEY;
  if (!key) {
    throw new Error(
      'supabase-server: SUPABASE_KEY (anon key) is not set. ' +
        'Add it to your Vercel environment variables.',
    );
  }
  return key;
}

// ---------------------------------------------------------------------------
// Singleton instances
// ---------------------------------------------------------------------------

let _serverClient: SupabaseClient | null = null;
let _anonClient: SupabaseClient | null = null;

/**
 * Returns a service-role Supabase client.
 * Bypasses Row Level Security — use ONLY in server-side cron handlers and
 * API routes that have already verified authentication.
 *
 * Singleton — safe to call multiple times.
 */
export function supabaseServer(): SupabaseClient {
  if (_serverClient) return _serverClient;

  logger.info('supabase-server: creating service-role client');

  _serverClient = createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        'x-lenzy-source': 'cron-pipeline',
      },
    },
  });

  return _serverClient;
}

/**
 * Returns an anon-key Supabase client.
 * Respects Row Level Security — use for route handlers where RLS is enforced.
 *
 * Singleton — safe to call multiple times.
 */
export function supabaseAnon(): SupabaseClient {
  if (_anonClient) return _anonClient;

  logger.info('supabase-server: creating anon client');

  _anonClient = createClient(getSupabaseUrl(), getAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return _anonClient;
}

// ---------------------------------------------------------------------------
// Typed query helpers for the vision pipeline tables
// ---------------------------------------------------------------------------

/** Returns the brand_content table reference (service-role). */
export function brandContentTable() {
  return supabaseServer().from('brand_content');
}

/** Returns the crop_queue table reference (service-role). */
export function cropQueueTable() {
  return supabaseServer().from('crop_queue');
}

/** Returns the celeb_photo_embeddings table reference (service-role). */
export function celebPhotoEmbeddingsTable() {
  return supabaseServer().from('celeb_photo_embeddings');
}

/** Returns the product_embeddings table reference (service-role). */
export function productEmbeddingsTable() {
  return supabaseServer().from('product_embeddings');
}

/** Returns the directory_celebrities table reference (service-role). */
export function directoryCelebritiesTable() {
  return supabaseServer().from('directory_celebrities');
}

// ---------------------------------------------------------------------------
// pgvector nearest-neighbour helper
// ---------------------------------------------------------------------------

/**
 * Run a cosine nearest-neighbour search against product_embeddings.
 * Uses pgvector HNSW with ef_search=100 for high recall.
 *
 * @param embedding - 768-dim float array from OpenCLIP
 * @param limit - number of candidates to return (default 5)
 * @returns array of { product_embedding_id, product_id, brand_id, product_name, product_image_url, similarity }
 */
export async function findNearestProducts(
  embedding: number[],
  limit = 5,
): Promise<
  Array<{
    product_embedding_id: number;
    product_id: number;
    brand_id: number;
    product_name: string;
    product_image_url: string | null;
    similarity: number;
  }>
> {
  const db = supabaseServer();

  // pgvector cosine distance: <=> returns distance (0=identical, 2=opposite)
  // We convert to similarity = 1 - distance
  const { data, error } = await db.rpc('match_product_embeddings', {
    query_embedding: embedding,
    match_count: limit,
  });

  if (error) {
    logger.error({ error }, 'supabase-server: findNearestProducts RPC failed');
    throw new Error(`pgvector match failed: ${error.message}`);
  }

  return (data ?? []) as Array<{
    product_embedding_id: number;
    product_id: number;
    brand_id: number;
    product_name: string;
    product_image_url: string | null;
    similarity: number;
  }>;
}

/**
 * SQL for the match_product_embeddings RPC function.
 * Add this to a migration file:
 *
 * CREATE OR REPLACE FUNCTION match_product_embeddings(
 *   query_embedding vector(768),
 *   match_count     int DEFAULT 5
 * )
 * RETURNS TABLE (
 *   product_embedding_id bigint,
 *   product_id           bigint,
 *   brand_id             bigint,
 *   product_name         text,
 *   product_image_url    text,
 *   similarity           float
 * )
 * LANGUAGE sql STABLE
 * AS $$
 *   SET hnsw.ef_search = 100;
 *   SELECT
 *     pe.id                               AS product_embedding_id,
 *     pe.product_id,
 *     pe.brand_id,
 *     pe.product_name,
 *     pe.product_image_url,
 *     1 - (pe.embedding <=> query_embedding) AS similarity
 *   FROM product_embeddings pe
 *   ORDER BY pe.embedding <=> query_embedding
 *   LIMIT match_count;
 * $$;
 */
export const MATCH_PRODUCTS_RPC_SQL = `
CREATE OR REPLACE FUNCTION match_product_embeddings(
  query_embedding vector(768),
  match_count     int DEFAULT 5
)
RETURNS TABLE (
  product_embedding_id bigint,
  product_id           bigint,
  brand_id             bigint,
  product_name         text,
  product_image_url    text,
  similarity           float
)
LANGUAGE sql STABLE
AS $$
  SET hnsw.ef_search = 100;
  SELECT
    pe.id                               AS product_embedding_id,
    pe.product_id,
    pe.brand_id,
    pe.product_name,
    pe.product_image_url,
    1 - (pe.embedding <=> query_embedding) AS similarity
  FROM product_embeddings pe
  ORDER BY pe.embedding <=> query_embedding
  LIMIT match_count;
$$;
`;
