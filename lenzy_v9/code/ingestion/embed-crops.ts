/**
 * embed-crops.ts — Batch embed eyewear crop images via Replicate OpenCLIP
 *
 * Purpose: Picks crop_queue rows where embedded_at IS NULL, batches them
 *          (up to 5 per Replicate call), calls OpenCLIP ViT-L/14 to generate
 *          768-dim image embeddings, and upserts into celeb_photo_embeddings.
 *          Updates crop_queue.embedding_id and crop_queue.embedded_at.
 *
 * Env vars required:
 *   REPLICATE_API_TOKEN
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *   CRON_SECRET                (verified in route.ts wrapper)
 *
 * Example invocation (local test):
 *   BATCH_SIZE=25 npx tsx code/ingestion/embed-crops.ts
 *
 * Cron schedule: every 2 hours — see vercel.json /api/cron/embed-crops
 */

import { logger } from '@/lib/logger';
import { embedImages } from './replicate-embed';
import { supabaseServer } from './supabase-server';
import type { CronStepStats, CropQueueRow } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = parseInt(process.env.CRON_BATCH_SIZE ?? '50', 10);
const REPLICATE_BATCH_SIZE = 5; // images per Replicate call

// ---------------------------------------------------------------------------
// Core step function
// ---------------------------------------------------------------------------

/**
 * Embeds unprocessed crop images and upserts into celeb_photo_embeddings.
 * Returns stats suitable for JSON response in the cron route handler.
 */
export async function runEmbedCrops(batchSize = BATCH_SIZE): Promise<CronStepStats> {
  const start = Date.now();
  const db = supabaseServer();

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let embeddings_created = 0;

  // -------------------------------------------------------------------------
  // 1. Fetch unembedded crop_queue rows
  // -------------------------------------------------------------------------

  const { data: rows, error: fetchError } = await db
    .from('crop_queue')
    .select('id, brand_content_id, region_index, crop_url, vision_region')
    .is('embedded_at', null)
    .is('error', null) // skip rows that previously errored
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (fetchError) {
    logger.error({ error: fetchError }, 'embed-crops: failed to fetch rows');
    throw new Error(`DB fetch failed: ${fetchError.message}`);
  }

  const pendingRows = (rows ?? []) as CropQueueRow[];

  if (pendingRows.length === 0) {
    logger.info({ step: 'embed-crops' }, 'embed-crops: no crops to embed');
    return { step: 'embed-crops', batch_size: 0, processed: 0, skipped: 0, errors: 0, duration_ms: Date.now() - start };
  }

  logger.info({ count: pendingRows.length, step: 'embed-crops' }, 'embed-crops: processing crops');

  // -------------------------------------------------------------------------
  // 2. Process in Replicate batches
  // -------------------------------------------------------------------------

  for (let i = 0; i < pendingRows.length; i += REPLICATE_BATCH_SIZE) {
    const batch = pendingRows.slice(i, i + REPLICATE_BATCH_SIZE);
    const cropUrls = batch.map((r) => r.crop_url);

    logger.info(
      { batch_start: i, batch_size: batch.length },
      'embed-crops: calling Replicate',
    );

    const result = await embedImages(cropUrls);

    if (!result.ok) {
      logger.error(
        { error: result.error, batch_start: i },
        'embed-crops: Replicate embedding failed',
      );

      // Mark rows as errored so they aren't retried in tight loops
      for (const row of batch) {
        await db
          .from('crop_queue')
          .update({ error: result.error })
          .eq('id', row.id);
      }

      errors += batch.length;
      continue;
    }

    if (result.embeddings.length !== batch.length) {
      logger.error(
        { expected: batch.length, got: result.embeddings.length },
        'embed-crops: embedding count mismatch',
      );
      errors += batch.length;
      continue;
    }

    // -----------------------------------------------------------------------
    // 3. Upsert each embedding and update crop_queue
    // -----------------------------------------------------------------------

    const now = new Date().toISOString();

    for (let j = 0; j < batch.length; j++) {
      const cropRow = batch[j]!;
      const embedding = result.embeddings[j]!;

      try {
        // Insert embedding into celeb_photo_embeddings
        const { data: embeddingData, error: insertError } = await db
          .from('celeb_photo_embeddings')
          .upsert(
            {
              crop_queue_id: cropRow.id,
              brand_content_id: cropRow.brand_content_id,
              embedding,
              model: result.model,
              created_at: now,
            },
            {
              onConflict: 'crop_queue_id',
              ignoreDuplicates: false,
            },
          )
          .select('id')
          .single();

        if (insertError) {
          logger.error(
            { error: insertError, crop_id: cropRow.id },
            'embed-crops: embedding insert failed',
          );
          errors++;
          continue;
        }

        const embeddingId = embeddingData?.id as number | undefined;

        // Update crop_queue row
        const { error: updateError } = await db
          .from('crop_queue')
          .update({
            embedding_id: embeddingId ?? null,
            embedded_at: now,
          })
          .eq('id', cropRow.id);

        if (updateError) {
          logger.error(
            { error: updateError, crop_id: cropRow.id },
            'embed-crops: crop_queue update failed',
          );
          errors++;
        } else {
          embeddings_created++;
          processed++;
          logger.info(
            {
              crop_id: cropRow.id,
              brand_content_id: cropRow.brand_content_id,
              embedding_id: embeddingId,
            },
            'embed-crops: embedding created',
          );
        }
      } catch (err) {
        logger.error({ err, crop_id: cropRow.id }, 'embed-crops: per-crop error');
        errors++;
      }
    }
  }

  const duration_ms = Date.now() - start;

  logger.info(
    {
      step: 'embed-crops',
      processed,
      skipped,
      errors,
      embeddings_created,
      duration_ms,
    },
    'embed-crops: complete',
  );

  return {
    step: 'embed-crops',
    batch_size: pendingRows.length,
    processed,
    skipped,
    errors,
    duration_ms,
    cost_estimate_usd: processed * 0.00017,
    details: { embeddings_created },
  };
}
