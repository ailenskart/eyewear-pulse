/**
 * celeb-scan.ts — Vercel cron entry: Instagram scrape for celebrity accounts
 *
 * Purpose: Reads "due" celebrities from directory_celebrities, runs the
 *          Apify Instagram scraper (shu8hvrXbJbY3Eb9W) per handle to fetch
 *          5–10 most recent posts, downloads each image to Vercel Blob, and
 *          writes rows to brand_content with type='unattributed_photo' and
 *          celebrity_id set. Idempotent via ON CONFLICT (platform, post_id).
 *
 * Env vars required:
 *   APIFY_TOKEN
 *   BLOB_READ_WRITE_TOKEN
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *   CRON_SECRET                (verified in route.ts wrapper)
 *
 * Example invocation (local test):
 *   BATCH_SIZE=5 npx tsx code/ingestion/celeb-scan.ts
 *
 * Cron schedule: every 6 hours — see vercel.json /api/cron/celeb-scan
 */

import { put } from '@vercel/blob';
import { logger } from '@/lib/logger';
import { runApifyIGScraper } from './apify-client';
import { supabaseServer } from './supabase-server';
import type {
  ApifyIGPost,
  CronStepStats,
  DirectoryCelebrity,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POSTS_PER_HANDLE = parseInt(process.env.CELEB_SCAN_POSTS_PER_HANDLE ?? '10', 10);
const BATCH_SIZE = parseInt(process.env.CRON_BATCH_SIZE ?? '10', 10); // handles per run
const HANDLES_PER_APIFY_CALL = 5; // handles batched into one actor call
const IG_BASE_URL = 'https://www.instagram.com/';

// ---------------------------------------------------------------------------
// Core step function
// ---------------------------------------------------------------------------

/**
 * Scans due celebrity IG handles and writes new posts to brand_content.
 * Returns stats suitable for JSON response in the cron route handler.
 */
export async function runCelebScan(batchSize = BATCH_SIZE): Promise<CronStepStats> {
  const start = Date.now();
  const db = supabaseServer();

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let newPostsWritten = 0;

  // -------------------------------------------------------------------------
  // 1. Fetch due celebrities
  // -------------------------------------------------------------------------

  const { data: dueCelebs, error: fetchError } = await db
    .from('directory_celebrities')
    .select('id, name, ig_handle, scan_frequency_hours, last_scanned_at, tier')
    .eq('scan_enabled', true)
    .not('ig_handle', 'is', null)
    .or(
      'last_scanned_at.is.null,' +
        `last_scanned_at.lt.${new Date(
          Date.now() - 6 * 3600 * 1000, // minimum scan interval guard
        ).toISOString()}`,
    )
    .order('last_scanned_at', { ascending: true, nullsFirst: true })
    .limit(batchSize);

  if (fetchError) {
    logger.error({ error: fetchError }, 'celeb-scan: failed to fetch due celebrities');
    throw new Error(`DB fetch failed: ${fetchError.message}`);
  }

  const celebs = (dueCelebs ?? []) as DirectoryCelebrity[];

  if (celebs.length === 0) {
    logger.info({ step: 'celeb-scan' }, 'celeb-scan: no due celebrities found');
    return { step: 'celeb-scan', batch_size: 0, processed: 0, skipped: 0, errors: 0, duration_ms: Date.now() - start };
  }

  logger.info({ count: celebs.length, step: 'celeb-scan' }, 'celeb-scan: processing celebrities');

  // -------------------------------------------------------------------------
  // 2. Process in sub-batches (5 handles per Apify call)
  // -------------------------------------------------------------------------

  for (let i = 0; i < celebs.length; i += HANDLES_PER_APIFY_CALL) {
    const batch = celebs.slice(i, i + HANDLES_PER_APIFY_CALL);
    const urls = batch.map((c) => `${IG_BASE_URL}${c.ig_handle}/`);
    const handleIndex = Object.fromEntries(batch.map((c) => [c.ig_handle, c]));

    logger.info(
      { handles: batch.map((c) => c.ig_handle), sub_batch: Math.floor(i / HANDLES_PER_APIFY_CALL) },
      'celeb-scan: running Apify sub-batch',
    );

    const result = await runApifyIGScraper(
      {
        directUrls: urls,
        resultsType: 'posts',
        resultsLimit: POSTS_PER_HANDLE,
      },
      { handle: batch.map((c) => c.ig_handle).join(',') },
    );

    if (!result.ok) {
      logger.error(
        { error: result.error, handles: batch.map((c) => c.ig_handle) },
        'celeb-scan: Apify run failed for sub-batch',
      );
      errors += batch.length;

      // Increment error count on each celeb in this batch
      for (const celeb of batch) {
        await db
          .from('directory_celebrities')
          .update({
            scan_error_count: db.rpc('coalesce_increment', { col: 'scan_error_count' }),
            last_scan_error: result.error,
            updated_at: new Date().toISOString(),
          })
          .eq('id', celeb.id);
      }
      continue;
    }

    // -----------------------------------------------------------------------
    // 3. Process posts from this sub-batch
    // -----------------------------------------------------------------------

    const posts = result.items;
    logger.info({ count: posts.length }, 'celeb-scan: Apify returned posts');

    for (const post of posts) {
      try {
        const handle = post.ownerUsername ?? post.inputUrl?.split('instagram.com/')?.[1]?.replace('/', '') ?? null;
        const celeb = handle ? handleIndex[handle] ?? null : null;

        if (!celeb) {
          skipped++;
          continue;
        }

        // Upload main image to Vercel Blob immediately (before CDN expiry)
        const rawImageUrl = post.images?.[0] ?? post.displayUrl ?? null;
        let blobUrl: string | null = null;

        if (rawImageUrl) {
          blobUrl = await uploadImageToBlob(rawImageUrl, post);
        }

        if (!blobUrl) {
          skipped++;
          continue;
        }

        // Write to brand_content
        const { error: upsertError } = await db.from('brand_content').upsert(
          {
            celebrity_id: celeb.id,
            brand_id: null,
            type: 'unattributed_photo',
            platform: 'instagram',
            post_id: String(post.id ?? post.shortCode ?? ''),
            media_url: blobUrl,
            thumbnail_url: blobUrl,
            caption: post.caption ?? null,
            hashtags: post.hashtags ?? [],
            posted_at: post.timestamp ?? null,
            likes_count: Math.max(0, post.likesCount ?? 0),
            comments_count: Math.max(0, post.commentsCount ?? 0),
            source_ref: {
              platform: 'instagram',
              actor_id: 'shu8hvrXbJbY3Eb9W',
              original_url: post.url ?? null,
              owner_username: post.ownerUsername ?? null,
            },
            vision: null,
            is_active: true,
            data: {
              apify_post_type: post.type ?? null,
              has_video: !!post.videoUrl,
            },
          },
          {
            onConflict: 'platform,post_id',
            ignoreDuplicates: true,
          },
        );

        if (upsertError) {
          logger.error(
            { error: upsertError, post_id: post.id, handle: celeb.ig_handle },
            'celeb-scan: upsert failed',
          );
          errors++;
        } else {
          newPostsWritten++;
          processed++;
        }
      } catch (err) {
        logger.error({ err, post_id: post.id }, 'celeb-scan: error processing post');
        errors++;
      }
    }

    // -----------------------------------------------------------------------
    // 4. Update last_scanned_at for each celeb in this batch
    // -----------------------------------------------------------------------

    const now = new Date().toISOString();
    for (const celeb of batch) {
      await db
        .from('directory_celebrities')
        .update({
          last_scanned_at: now,
          scan_error_count: 0,
          last_scan_error: null,
          updated_at: now,
        })
        .eq('id', celeb.id);
    }
  }

  const duration_ms = Date.now() - start;

  logger.info(
    {
      step: 'celeb-scan',
      processed,
      skipped,
      errors,
      new_posts: newPostsWritten,
      duration_ms,
    },
    'celeb-scan: complete',
  );

  return {
    step: 'celeb-scan',
    batch_size: celebs.length,
    processed,
    skipped,
    errors,
    duration_ms,
    details: { new_posts_written: newPostsWritten },
  };
}

// ---------------------------------------------------------------------------
// Image upload helper
// ---------------------------------------------------------------------------

async function uploadImageToBlob(
  rawUrl: string,
  post: ApifyIGPost,
): Promise<string | null> {
  const pid = String(post.id ?? post.shortCode ?? Date.now());

  try {
    const res = await fetch(rawUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      logger.warn({ status: res.status, url: rawUrl.slice(0, 80) }, 'celeb-scan: image fetch failed');
      return null;
    }

    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';

    const blob = await put(`posts/celeb_${pid}.${ext}`, Buffer.from(buffer), {
      access: 'public',
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return blob.url;
  } catch (err) {
    logger.error({ err, pid }, 'celeb-scan: blob upload failed');
    return null;
  }
}
