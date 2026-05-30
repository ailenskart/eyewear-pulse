/**
 * /api/cron/celeb-scan/route.ts — Next.js App Router cron route handler
 *
 * Purpose: Vercel cron entry point for the celebrity Instagram scan step.
 *          Verifies CRON_SECRET header, runs runCelebScan() in batches of
 *          50 handles (default), returns JSON stats. Wrapped with pino
 *          logger and Sentry capture for observability.
 *
 * Env vars required:
 *   CRON_SECRET               — Random 32-char secret; must match Vercel cron header
 *   APIFY_TOKEN
 *   BLOB_READ_WRITE_TOKEN
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * Cron schedule: 0 *\/6 * * * (every 6 hours)
 * Vercel cron path: /api/cron/celeb-scan
 *
 * Example invocation (local test):
 *   curl -X POST http://localhost:3000/api/cron/celeb-scan \
 *     -H "x-cron-secret: $CRON_SECRET"
 */

import { type NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';
import { runCelebScan } from '@/lib/ingestion/celeb-scan';
import type { CronStepStats } from '@/lib/ingestion/types';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes — Vercel Pro supports up to 300s

const DEFAULT_BATCH_SIZE = parseInt(process.env.CRON_BATCH_SIZE ?? '50', 10);

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Verify cron secret
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    logger.warn({ path: '/api/cron/celeb-scan' }, 'cron: unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const step = 'celeb-scan';
  const transaction = Sentry.startTransaction({ name: `cron.${step}`, op: 'cron' });

  logger.info({ step, batch_size: DEFAULT_BATCH_SIZE }, 'cron: starting');

  let stats: CronStepStats | null = null;

  try {
    stats = await runCelebScan(DEFAULT_BATCH_SIZE);

    logger.info(
      {
        step,
        processed: stats.processed,
        skipped: stats.skipped,
        errors: stats.errors,
        duration_ms: stats.duration_ms,
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

// Vercel cron also uses GET — redirect to POST logic
export async function GET(request: NextRequest): Promise<NextResponse> {
  return POST(request);
}
