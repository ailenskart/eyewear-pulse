/**
 * vision-detect.ts — Gemini Vision eyewear detection on unprocessed posts
 *
 * Purpose: Picks brand_content rows where type='unattributed_photo' and
 *          vision IS NULL and is_active=true. Calls Gemini Vision with the
 *          authoritative detection prompt. Writes vision jsonb back to the
 *          row. If eyewear_present=false, sets is_active=false to exclude the
 *          row from further processing (it still contributes to trend totals
 *          if needed but won't go through crop/embed/match pipeline).
 *
 * Env vars required:
 *   GEMINI_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *   CRON_SECRET                (verified in route.ts wrapper)
 *
 * Example invocation (local test):
 *   BATCH_SIZE=20 npx tsx code/ingestion/vision-detect.ts
 *
 * Cron schedule: every 2 hours — see vercel.json /api/cron/vision-detect
 */

import { logger } from '@/lib/logger';
import { detectEyewear } from './gemini-vision';
import { supabaseServer } from './supabase-server';
import type { BrandContentRow, CronStepStats, GeminiVisionResponse } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = parseInt(process.env.CRON_BATCH_SIZE ?? '50', 10);

// ---------------------------------------------------------------------------
// Core step function
// ---------------------------------------------------------------------------

/**
 * Processes a batch of unprocessed brand_content rows through Gemini Vision.
 * Returns stats suitable for JSON response in the cron route handler.
 */
export async function runVisionDetect(batchSize = BATCH_SIZE): Promise<CronStepStats> {
  const start = Date.now();
  const db = supabaseServer();

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let eyewear_found = 0;
  let eyewear_not_found = 0;

  // -------------------------------------------------------------------------
  // 1. Fetch rows needing vision processing
  // -------------------------------------------------------------------------

  const { data: rows, error: fetchError } = await db
    .from('brand_content')
    .select('id, media_url, celebrity_id, source_ref')
    .eq('type', 'unattributed_photo')
    .is('vision', null)
    .eq('is_active', true)
    .not('media_url', 'is', null)
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (fetchError) {
    logger.error({ error: fetchError }, 'vision-detect: failed to fetch rows');
    throw new Error(`DB fetch failed: ${fetchError.message}`);
  }

  const pendingRows = (rows ?? []) as Pick<BrandContentRow, 'id' | 'media_url' | 'celebrity_id' | 'source_ref'>[];

  if (pendingRows.length === 0) {
    logger.info({ step: 'vision-detect' }, 'vision-detect: no rows to process');
    return { step: 'vision-detect', batch_size: 0, processed: 0, skipped: 0, errors: 0, duration_ms: Date.now() - start };
  }

  logger.info({ count: pendingRows.length, step: 'vision-detect' }, 'vision-detect: processing rows');

  // -------------------------------------------------------------------------
  // 2. Process each row
  // -------------------------------------------------------------------------

  for (const row of pendingRows) {
    if (!row.media_url) {
      skipped++;
      continue;
    }

    try {
      logger.info(
        { row_id: row.id, url: row.media_url.slice(0, 60) },
        'vision-detect: calling Gemini',
      );

      const result = await detectEyewear(row.media_url);

      if (!result.ok) {
        logger.error(
          { row_id: row.id, error: result.error },
          'vision-detect: Gemini call failed',
        );

        // Mark parse failures with a sentinel so they aren't retried indefinitely
        if (result.error.startsWith('parse_failed:')) {
          await db
            .from('brand_content')
            .update({
              vision: { error: 'parse_failed', detail: result.error } as unknown as GeminiVisionResponse,
              updated_at: new Date().toISOString(),
            })
            .eq('id', row.id);
        }

        errors++;
        continue;
      }

      const visionData = result.data;
      const eyewearPresent = visionData.eyewear_present === true;

      if (eyewearPresent) {
        eyewear_found++;
      } else {
        eyewear_not_found++;
      }

      // Write vision result + update is_active
      const { error: updateError } = await db
        .from('brand_content')
        .update({
          vision: visionData as unknown as Record<string, unknown>,
          is_active: eyewearPresent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      if (updateError) {
        logger.error(
          { error: updateError, row_id: row.id },
          'vision-detect: DB update failed',
        );
        errors++;
      } else {
        processed++;
        logger.info(
          {
            row_id: row.id,
            eyewear_present: eyewearPresent,
            regions: visionData.eyewear_regions?.length ?? 0,
            model: result.model,
          },
          'vision-detect: row processed',
        );
      }
    } catch (err) {
      logger.error({ err, row_id: row.id }, 'vision-detect: unexpected error');
      errors++;
    }
  }

  const duration_ms = Date.now() - start;

  logger.info(
    {
      step: 'vision-detect',
      processed,
      skipped,
      errors,
      eyewear_found,
      eyewear_not_found,
      duration_ms,
    },
    'vision-detect: complete',
  );

  return {
    step: 'vision-detect',
    batch_size: pendingRows.length,
    processed,
    skipped,
    errors,
    duration_ms,
    cost_estimate_usd: processed * 0.000135,
    details: {
      eyewear_found,
      eyewear_not_found,
    },
  };
}
