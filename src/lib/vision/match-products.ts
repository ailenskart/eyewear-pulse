/**
 * match-products.ts — pgvector cosine match + attribution scoring
 *
 * Purpose: For each new celeb_photo_embedding (crop_queue rows where
 *          embedded_at IS NOT NULL and matched_at IS NULL), runs a cosine
 *          nearest-neighbour query against product_embeddings (HNSW index),
 *          selects the top-5 candidates, applies attribution threshold logic,
 *          and writes attribution jsonb to brand_content.
 *
 *          Threshold logic:
 *            >= 0.75 → auto-attribute (type='celeb_photo', brand_id set)
 *            0.50–0.74 → review queue (attribution.review_status='pending')
 *            < 0.50  → no match (attribution.review_status='no_match')
 *
 * Env vars required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CRON_SECRET                (verified in route.ts wrapper)
 *
 * Example invocation (local test):
 *   BATCH_SIZE=25 npx tsx code/ingestion/match-products.ts
 *
 * Cron schedule: every 2 hours — see vercel.json /api/cron/match-products
 */

import { logger } from '@/lib/logger';
import { supabaseServer, findNearestProducts } from './supabase-server';
import type {
  AttributionCandidate,
  AttributionData,
  CronStepStats,
  CropQueueRow,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = parseInt(process.env.CRON_BATCH_SIZE ?? '50', 10);
const TOP_K = 5;

const AUTO_ATTRIBUTE_THRESHOLD = parseFloat(
  process.env.VISION_AUTO_ATTRIBUTE_THRESHOLD ?? '0.75',
);
const REVIEW_THRESHOLD = parseFloat(
  process.env.VISION_REVIEW_THRESHOLD ?? '0.50',
);

// ---------------------------------------------------------------------------
// Core step function
// ---------------------------------------------------------------------------

/**
 * Matches new embeddings against product_embeddings and writes attribution.
 * Returns stats suitable for JSON response in the cron route handler.
 */
export async function runMatchProducts(batchSize = BATCH_SIZE): Promise<CronStepStats> {
  const start = Date.now();
  const db = supabaseServer();

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let auto_attributed = 0;
  let review_queue = 0;
  let no_match = 0;

  // -------------------------------------------------------------------------
  // 1. Fetch crop_queue rows that are embedded but not yet matched
  // -------------------------------------------------------------------------

  const { data: rows, error: fetchError } = await db
    .from('crop_queue')
    .select(
      'id, brand_content_id, region_index, crop_url, vision_region, embedding_id, embedded_at',
    )
    .not('embedded_at', 'is', null)
    .is('matched_at', null)
    .is('error', null)
    .order('embedded_at', { ascending: true })
    .limit(batchSize);

  if (fetchError) {
    logger.error({ error: fetchError }, 'match-products: failed to fetch rows');
    throw new Error(`DB fetch failed: ${fetchError.message}`);
  }

  const pendingRows = (rows ?? []) as CropQueueRow[];

  if (pendingRows.length === 0) {
    logger.info({ step: 'match-products' }, 'match-products: no rows to match');
    return { step: 'match-products', batch_size: 0, processed: 0, skipped: 0, errors: 0, duration_ms: Date.now() - start };
  }

  logger.info(
    { count: pendingRows.length, step: 'match-products' },
    'match-products: processing embeddings',
  );

  // -------------------------------------------------------------------------
  // 2. For each crop, fetch its embedding and run the match
  // -------------------------------------------------------------------------

  for (const cropRow of pendingRows) {
    if (!cropRow.embedding_id) {
      skipped++;
      continue;
    }

    try {
      // Fetch the embedding vector
      const { data: embeddingData, error: embFetchError } = await db
        .from('celeb_photo_embeddings')
        .select('embedding')
        .eq('id', cropRow.embedding_id)
        .single();

      if (embFetchError || !embeddingData?.embedding) {
        logger.warn(
          { crop_id: cropRow.id, embedding_id: cropRow.embedding_id },
          'match-products: embedding not found',
        );
        skipped++;
        continue;
      }

      const embedding = embeddingData.embedding as number[];

      // Run pgvector cosine nearest-neighbour
      let candidates: AttributionCandidate[];

      try {
        const matches = await findNearestProducts(embedding, TOP_K);
        candidates = matches.map((m, idx) => ({
          rank: idx + 1,
          product_id: m.product_id,
          brand_id: m.brand_id,
          product_name: m.product_name,
          similarity: m.similarity,
          product_image_url: m.product_image_url,
        }));
      } catch (pgErr) {
        logger.error({ err: pgErr, crop_id: cropRow.id }, 'match-products: pgvector query failed');
        errors++;
        continue;
      }

      const topSimilarity = candidates[0]?.similarity ?? 0;
      const topCandidate = candidates[0];
      const now = new Date().toISOString();

      // -----------------------------------------------------------------------
      // 3. Apply attribution threshold logic
      // -----------------------------------------------------------------------

      let newType: string;
      let newBrandId: number | null = null;
      let reviewStatus: string;

      if (topSimilarity >= AUTO_ATTRIBUTE_THRESHOLD && topCandidate) {
        // Auto-attribute
        newType = 'celeb_photo';
        newBrandId = topCandidate.brand_id;
        reviewStatus = 'auto_attributed';
        auto_attributed++;

        logger.info(
          {
            brand_content_id: cropRow.brand_content_id,
            product_id: topCandidate.product_id,
            brand_id: topCandidate.brand_id,
            similarity: topSimilarity,
          },
          'match-products: auto-attributed',
        );
      } else if (topSimilarity >= REVIEW_THRESHOLD) {
        // Review queue
        newType = 'unattributed_photo';
        reviewStatus = 'pending';
        review_queue++;

        logger.info(
          {
            brand_content_id: cropRow.brand_content_id,
            top_similarity: topSimilarity,
          },
          'match-products: added to review queue',
        );
      } else {
        // No match
        newType = 'unattributed_photo';
        reviewStatus = 'no_match';
        no_match++;

        logger.info(
          {
            brand_content_id: cropRow.brand_content_id,
            top_similarity: topSimilarity,
          },
          'match-products: no match',
        );
      }

      // Build attribution jsonb
      const attribution: AttributionData = {
        candidates,
        top_similarity: topSimilarity,
        embedding_model: 'openclip-vit-l-14',
        matched_at: now,
        ...(newType === 'celeb_photo' && topCandidate
          ? {
              auto_attributed: true,
              attributed_at: now,
            }
          : {
              review_status: reviewStatus as AttributionData['review_status'],
            }),
        gemini_eyewear_region: cropRow.vision_region,
      };

      // -----------------------------------------------------------------------
      // 4. Write to brand_content
      // -----------------------------------------------------------------------

      const updatePayload: Record<string, unknown> = {
        attribution: attribution as unknown as Record<string, unknown>,
        updated_at: now,
      };

      if (newType === 'celeb_photo') {
        updatePayload.type = 'celeb_photo';
        updatePayload.brand_id = newBrandId;
      }

      const { error: updateError } = await db
        .from('brand_content')
        .update(updatePayload)
        .eq('id', cropRow.brand_content_id);

      if (updateError) {
        logger.error(
          { error: updateError, brand_content_id: cropRow.brand_content_id },
          'match-products: brand_content update failed',
        );
        errors++;
        continue;
      }

      // Mark crop as matched
      await db
        .from('crop_queue')
        .update({ matched_at: now })
        .eq('id', cropRow.id);

      processed++;
    } catch (err) {
      logger.error({ err, crop_id: cropRow.id }, 'match-products: unexpected error');
      errors++;
    }
  }

  const duration_ms = Date.now() - start;

  logger.info(
    {
      step: 'match-products',
      processed,
      skipped,
      errors,
      auto_attributed,
      review_queue,
      no_match,
      duration_ms,
    },
    'match-products: complete',
  );

  return {
    step: 'match-products',
    batch_size: pendingRows.length,
    processed,
    skipped,
    errors,
    duration_ms,
    details: {
      auto_attributed,
      review_queue,
      no_match,
      auto_threshold: AUTO_ATTRIBUTE_THRESHOLD,
      review_threshold: REVIEW_THRESHOLD,
    },
  };
}
