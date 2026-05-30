/**
 * replicate-embed.ts — OpenCLIP ViT-L/14 image embedding via Replicate
 *
 * Purpose: Wraps the Replicate API to generate 768-dimensional OpenCLIP
 *          embeddings from image crops. Handles cold-start latency (up to
 *          60s), batching (up to 5 images per call), retries, and budget
 *          tracking. Used to embed eyewear crop images before pgvector
 *          nearest-neighbour matching.
 *
 * Model: andreasjansson/clip-features (OpenCLIP ViT-L/14, 768-dim)
 *
 * Env vars required:
 *   REPLICATE_API_TOKEN     — Replicate API token
 *   UPSTASH_REDIS_REST_URL  — Redis URL for budget counters
 *   UPSTASH_REDIS_REST_TOKEN — Redis token
 *
 * Example invocation:
 *   const result = await embedImages(['https://blob.vercel-storage.com/crops/123/0.jpg']);
 *   if (result.ok) { const vector = result.embeddings[0]; }
 *
 * Cron schedule: called from embed-crops/route.ts (every 2h)
 */

import { logger } from '@/lib/logger';
import type { OpenCLIPEmbeddingResult } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Pinned model version for reproducibility.
 * Update by running: `replicate model versions list andreasjansson/clip-features`
 * Current pinned version as of 2026-01.
 */
const CLIP_MODEL_VERSION =
  process.env.REPLICATE_CLIP_MODEL_VERSION ??
  '75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a';

const REPLICATE_API_BASE = 'https://api.replicate.com/v1';
const MAX_BATCH_SIZE = 5;
const MAX_RETRIES = 3;
/** Cold starts on Replicate A40 can take up to 60s. Warm is ~0.3s. */
const PREDICTION_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;

const REDIS_BUDGET_KEY_PREFIX = 'lenzy:budget:replicate';
const DAILY_REPLICATE_CALL_LIMIT = parseInt(process.env.DAILY_REPLICATE_CALL_LIMIT ?? '5000', 10);

// ---------------------------------------------------------------------------
// Env validation
// ---------------------------------------------------------------------------

function assertEnv(): void {
  const required = [
    'REPLICATE_API_TOKEN',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`replicate-embed: missing required env vars: ${missing.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// Budget guard
// ---------------------------------------------------------------------------

async function incrementReplicateBudget(count: number): Promise<{ allowed: boolean; used: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${REDIS_BUDGET_KEY_PREFIX}:${today}`;
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/incrby/${encodeURIComponent(key)}/${count}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN!}` },
    });
    if (!res.ok) return { allowed: true, used: 0 };

    const json = (await res.json()) as { result: number };
    const used = json.result;

    if (used <= count) {
      // First write of the day — set TTL
      await fetch(
        `${process.env.UPSTASH_REDIS_REST_URL}/expire/${encodeURIComponent(key)}/90000`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN!}` },
        },
      );
    }

    return { allowed: used <= DAILY_REPLICATE_CALL_LIMIT, used };
  } catch {
    return { allowed: true, used: 0 };
  }
}

// ---------------------------------------------------------------------------
// Replicate prediction lifecycle
// ---------------------------------------------------------------------------

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: OpenCLIPEmbeddingResult[] | null;
  error?: string | null;
  urls?: { get?: string; cancel?: string };
}

async function createPrediction(imageUrls: string[]): Promise<ReplicatePrediction> {
  const res = await fetch(`${REPLICATE_API_BASE}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${process.env.REPLICATE_API_TOKEN!}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: CLIP_MODEL_VERSION,
      input: {
        inputs: imageUrls.map((url) => ({ image: url })),
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Replicate create prediction failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  return (await res.json()) as ReplicatePrediction;
}

async function pollPrediction(predictionId: string): Promise<ReplicatePrediction> {
  const start = Date.now();

  while (Date.now() - start < PREDICTION_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);

    const res = await fetch(`${REPLICATE_API_BASE}/predictions/${predictionId}`, {
      headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN!}` },
    });

    if (!res.ok) {
      throw new Error(`Replicate poll failed (${res.status})`);
    }

    const prediction = (await res.json()) as ReplicatePrediction;

    if (prediction.status === 'succeeded' || prediction.status === 'failed' || prediction.status === 'canceled') {
      return prediction;
    }

    logger.info(
      { predictionId, status: prediction.status, elapsed_ms: Date.now() - start },
      'replicate-embed: polling prediction',
    );
  }

  throw new Error(`Replicate prediction ${predictionId} timed out after ${PREDICTION_TIMEOUT_MS}ms`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type EmbedImagesResult =
  | { ok: true; embeddings: number[][]; model: string }
  | { ok: false; error: string };

/**
 * Generate OpenCLIP ViT-L/14 embeddings for a batch of image URLs.
 * Automatically chunks into MAX_BATCH_SIZE groups.
 *
 * @param imageUrls - Array of publicly accessible image URLs (Vercel Blob URLs recommended)
 * @returns 768-dimensional float arrays, one per input image, in the same order
 */
export async function embedImages(imageUrls: string[]): Promise<EmbedImagesResult> {
  assertEnv();

  if (imageUrls.length === 0) {
    return { ok: true, embeddings: [], model: 'openclip-vit-l-14' };
  }

  const { allowed, used } = await incrementReplicateBudget(imageUrls.length);
  if (!allowed) {
    return { ok: false, error: `Daily Replicate budget exceeded (used: ${used})` };
  }

  const allEmbeddings: number[][] = [];

  // Process in batches of MAX_BATCH_SIZE
  for (let i = 0; i < imageUrls.length; i += MAX_BATCH_SIZE) {
    const batch = imageUrls.slice(i, i + MAX_BATCH_SIZE);
    let lastError = '';

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.info(
          { batch_size: batch.length, attempt, batch_start: i },
          'replicate-embed: starting prediction',
        );

        const prediction = await createPrediction(batch);

        logger.info(
          { predictionId: prediction.id, batch_start: i },
          'replicate-embed: prediction created, polling',
        );

        const result = await pollPrediction(prediction.id);

        if (result.status !== 'succeeded') {
          lastError = result.error ?? `Prediction ${result.status}`;
          logger.warn({ attempt, predictionId: prediction.id, error: lastError }, 'replicate-embed: prediction not succeeded');
          await sleep(attempt * 3000);
          continue;
        }

        if (!result.output || result.output.length === 0) {
          lastError = 'Prediction succeeded but output is empty';
          logger.warn({ attempt, predictionId: prediction.id }, lastError);
          await sleep(attempt * 2000);
          continue;
        }

        for (const item of result.output) {
          if (!Array.isArray(item.embedding) || item.embedding.length !== 768) {
            lastError = `Unexpected embedding shape: length=${item.embedding?.length}`;
            logger.error({ attempt }, lastError);
            // Zero-fill as fallback to avoid data loss
            allEmbeddings.push(new Array(768).fill(0) as number[]);
          } else {
            allEmbeddings.push(item.embedding);
          }
        }

        logger.info(
          { batch_size: batch.length, batch_start: i },
          'replicate-embed: batch complete',
        );
        break; // Success — move to next batch
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        logger.error({ attempt, batch_start: i, err: lastError }, 'replicate-embed: call threw');

        if (lastError.includes('401') || lastError.includes('Unauthorized')) {
          return { ok: false, error: 'REPLICATE_API_TOKEN is invalid' };
        }

        if (attempt === MAX_RETRIES) {
          return { ok: false, error: `Failed after ${MAX_RETRIES} attempts: ${lastError}` };
        }

        await sleep(attempt * 3000);
      }
    }
  }

  return { ok: true, embeddings: allEmbeddings, model: 'openclip-vit-l-14' };
}

/**
 * Generate an embedding for a single image URL.
 * Convenience wrapper around embedImages.
 */
export async function embedSingleImage(
  imageUrl: string,
): Promise<{ ok: true; embedding: number[]; model: string } | { ok: false; error: string }> {
  const result = await embedImages([imageUrl]);
  if (!result.ok) return result;
  if (result.embeddings.length === 0) {
    return { ok: false, error: 'No embedding returned for single image' };
  }
  return { ok: true, embedding: result.embeddings[0]!, model: result.model };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
