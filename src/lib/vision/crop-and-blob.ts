/**
 * crop-and-blob.ts — Crop eyewear regions and upload to Vercel Blob
 *
 * Purpose: For brand_content rows where vision.eyewear_present=true and no
 *          corresponding crop_queue rows exist yet, crops each eyewear_region
 *          to a square padded by 20%, resizes to 224×224, and uploads to
 *          Vercel Blob. Writes one crop_queue row per region.
 *
 *          Uses the `sharp` npm package for in-memory image manipulation.
 *
 * Env vars required:
 *   BLOB_READ_WRITE_TOKEN
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Example invocation (local test):
 *   BATCH_SIZE=25 npx tsx code/ingestion/crop-and-blob.ts
 *
 * Cron schedule: every 2 hours — see vercel.json /api/cron/crop-and-blob
 */

import sharp from 'sharp';
import { put } from '@vercel/blob';
import { logger } from '@/lib/logger';
import { supabaseServer } from './supabase-server';
import type {
  BrandContentRow,
  CronStepStats,
  EyewearBoundingBox,
  EyewearRegion,
  GeminiVisionResponse,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = parseInt(process.env.CRON_BATCH_SIZE ?? '50', 10);
const CROP_OUTPUT_SIZE = 224; // px — OpenCLIP input size
const PADDING_RATIO = 0.2;   // 20% padding around bbox

// ---------------------------------------------------------------------------
// Core step function
// ---------------------------------------------------------------------------

/**
 * For rows with vision data containing eyewear regions, crop and upload
 * each region to Vercel Blob and write a crop_queue row.
 */
export async function runCropAndBlob(batchSize = BATCH_SIZE): Promise<CronStepStats> {
  const start = Date.now();
  const db = supabaseServer();

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let crops_created = 0;

  // -------------------------------------------------------------------------
  // 1. Fetch rows that have eyewear but no crop_queue entries yet
  // -------------------------------------------------------------------------

  const { data: rows, error: fetchError } = await db
    .from('brand_content')
    .select('id, media_url, vision')
    .eq('is_active', true)
    .not('vision', 'is', null)
    // Exclude rows that already have crops
    .not(
      'id',
      'in',
      `(SELECT DISTINCT brand_content_id FROM crop_queue)`,
    )
    .order('updated_at', { ascending: true })
    .limit(batchSize);

  if (fetchError) {
    logger.error({ error: fetchError }, 'crop-and-blob: failed to fetch rows');
    throw new Error(`DB fetch failed: ${fetchError.message}`);
  }

  const pendingRows = (rows ?? []) as Pick<BrandContentRow, 'id' | 'media_url' | 'vision'>[];

  // Filter to rows with actual eyewear
  const eyewearRows = pendingRows.filter((r) => {
    const vision = r.vision as GeminiVisionResponse | null;
    return vision?.eyewear_present === true && (vision?.eyewear_regions?.length ?? 0) > 0;
  });

  if (eyewearRows.length === 0) {
    logger.info({ step: 'crop-and-blob' }, 'crop-and-blob: no rows to process');
    return { step: 'crop-and-blob', batch_size: 0, processed: 0, skipped: 0, errors: 0, duration_ms: Date.now() - start };
  }

  logger.info({ count: eyewearRows.length, step: 'crop-and-blob' }, 'crop-and-blob: processing rows');

  // -------------------------------------------------------------------------
  // 2. Process each row
  // -------------------------------------------------------------------------

  for (const row of eyewearRows) {
    if (!row.media_url) {
      skipped++;
      continue;
    }

    const vision = row.vision as GeminiVisionResponse;

    try {
      // Fetch the original image
      const imageBuffer = await fetchImageBuffer(row.media_url);
      if (!imageBuffer) {
        logger.warn({ row_id: row.id }, 'crop-and-blob: could not fetch image');
        skipped++;
        continue;
      }

      // Get image metadata
      const metadata = await sharp(imageBuffer).metadata();
      const imgWidth = metadata.width ?? 800;
      const imgHeight = metadata.height ?? 800;

      // Process each eyewear region
      for (let regionIndex = 0; regionIndex < vision.eyewear_regions.length; regionIndex++) {
        const region = vision.eyewear_regions[regionIndex]!;

        try {
          const cropBuffer = await cropRegion(imageBuffer, region.bbox, imgWidth, imgHeight);

          if (!cropBuffer) {
            logger.warn({ row_id: row.id, regionIndex }, 'crop-and-blob: crop failed');
            errors++;
            continue;
          }

          // Upload to Vercel Blob
          const blobPath = `crops/${row.id}/${regionIndex}_${Date.now()}.jpg`;
          const blobResult = await put(blobPath, cropBuffer, {
            access: 'public',
            contentType: 'image/jpeg',
            token: process.env.BLOB_READ_WRITE_TOKEN,
          });

          // Write crop_queue row
          const { error: insertError } = await db.from('crop_queue').insert({
            brand_content_id: row.id,
            region_index: regionIndex,
            crop_url: blobResult.url,
            vision_region: region as unknown as Record<string, unknown>,
            embedded_at: null,
            matched_at: null,
          });

          if (insertError) {
            logger.error(
              { error: insertError, row_id: row.id, regionIndex },
              'crop-and-blob: crop_queue insert failed',
            );
            errors++;
          } else {
            crops_created++;
            logger.info(
              { row_id: row.id, regionIndex, crop_url: blobResult.url.slice(0, 60) },
              'crop-and-blob: crop created',
            );
          }
        } catch (regionErr) {
          logger.error(
            { err: regionErr, row_id: row.id, regionIndex },
            'crop-and-blob: region crop error',
          );
          errors++;
        }
      }

      processed++;
    } catch (err) {
      logger.error({ err, row_id: row.id }, 'crop-and-blob: row processing error');
      errors++;
    }
  }

  const duration_ms = Date.now() - start;

  logger.info(
    {
      step: 'crop-and-blob',
      processed,
      skipped,
      errors,
      crops_created,
      duration_ms,
    },
    'crop-and-blob: complete',
  );

  return {
    step: 'crop-and-blob',
    batch_size: eyewearRows.length,
    processed,
    skipped,
    errors,
    duration_ms,
    details: { crops_created },
  };
}

// ---------------------------------------------------------------------------
// Crop helper
// ---------------------------------------------------------------------------

/**
 * Crops an eyewear region from an image buffer using normalized bbox coords.
 * Applies 20% padding and makes the crop square, then resizes to 224×224.
 */
async function cropRegion(
  imageBuffer: Buffer,
  bbox: EyewearBoundingBox,
  imgWidth: number,
  imgHeight: number,
): Promise<Buffer | null> {
  try {
    // Convert normalized to pixel coordinates
    const px = bbox.x * imgWidth;
    const py = bbox.y * imgHeight;
    const pw = bbox.width * imgWidth;
    const ph = bbox.height * imgHeight;

    // Apply padding
    const padX = pw * PADDING_RATIO;
    const padY = ph * PADDING_RATIO;

    let cropX = Math.max(0, Math.floor(px - padX));
    let cropY = Math.max(0, Math.floor(py - padY));
    let cropW = Math.min(imgWidth - cropX, Math.ceil(pw + 2 * padX));
    let cropH = Math.min(imgHeight - cropY, Math.ceil(ph + 2 * padY));

    // Make square — use the larger dimension
    const side = Math.max(cropW, cropH);

    // Center the square crop
    const centerX = cropX + cropW / 2;
    const centerY = cropY + cropH / 2;

    cropX = Math.max(0, Math.floor(centerX - side / 2));
    cropY = Math.max(0, Math.floor(centerY - side / 2));
    cropW = Math.min(imgWidth - cropX, side);
    cropH = Math.min(imgHeight - cropY, side);

    if (cropW < 10 || cropH < 10) {
      logger.warn({ bbox, cropW, cropH }, 'crop-and-blob: crop too small, skipping');
      return null;
    }

    const cropped = await sharp(imageBuffer)
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .resize(CROP_OUTPUT_SIZE, CROP_OUTPUT_SIZE, { fit: 'cover' })
      .jpeg({ quality: 90 })
      .toBuffer();

    return cropped;
  } catch (err) {
    logger.error({ err, bbox }, 'crop-and-blob: sharp crop failed');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Image fetch helper
// ---------------------------------------------------------------------------

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      logger.warn({ status: res.status, url: url.slice(0, 80) }, 'crop-and-blob: image fetch failed');
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    logger.error({ err, url: url.slice(0, 80) }, 'crop-and-blob: image fetch threw');
    return null;
  }
}
