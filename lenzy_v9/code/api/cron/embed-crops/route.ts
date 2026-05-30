/**
 * /api/cron/embed-crops/route.ts — Next.js App Router cron route handler
 *
 * Purpose: Vercel cron entry point for the OpenCLIP image embedding step.
 *          Verifies CRON_SECRET header, runs runEmbedCrops() in batches of
 *          50 crops (default), returns JSON stats. Wrapped with pino logger
 *          and Sentry capture for observability.
 *
 * Env vars required:
 *   CRON_SECRET               — Random 32-char secret
 *   REPLICATE_API_TOKEN
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * Cron schedule: 0 *\/2 * * * (every 2 hours)
 * Vercel cron path: /api/cron/embed-crops
 *
 * Example invocation (local test):
 *   curl -X POST http://localhost:3000/api/cron/embed-crops \
 *     -H "x-cron-secret: $CRON_SECRET"
 */

import { type NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';
import { runEmbedCrops } from '@/lib/ingestion/embed-crops';
import type { CronStepStats } from '@/lib/ingestion/types';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const runtime = 'nodejs';
export const maxDuration = 300;

const DEFAULT_BATCH_SIZE = parseInt(process.env.CRON_BATCH_SIZE ?? '50', 10);

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    logger.warn({ path: '/api/cron/embed-crops' }, 'cron: unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const step = 'embed-crops';
  const transaction = Sentry.startTransaction({ name: `cron.${step}`, op: 'cron' });

  logger.info({ step, batch_size: DEFAULT_BATCH_SIZE }, 'cron: starting');

  let stats: CronStepStats | null = null;

  try {
    stats = await runEmbedCrops(DEFAULT_BATCH_SIZE);

    logger.info(
      {
        step,
        processed: stats.processed,
        skipped: stats.skipped,
        errors: stats.errors,
        duration_ms: stats.duration_ms,
        cost_estimate_usd: stats.cost_estimate_usd,
        details: stats.details,
      },
      'cron: complete',
    );

    return NextResponse.json({ ok: true, stats }, { status: 200 });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, { extra: { step, batch_size: DEFAULT_BATCH_SIZE } });
    logger.error({ err: errorMessage, step }, 'cron: unhandled error');

    return NextResponse.json(
      { ok: false, error: errorMessage, step },
      { status: 500 },
    );
  } finally {
    transaction.finish();
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return POST(request);
}
