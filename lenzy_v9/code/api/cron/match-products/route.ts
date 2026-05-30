/**
 * /api/cron/match-products/route.ts — Next.js App Router cron route handler
 *
 * Purpose: Vercel cron entry point for the pgvector product-matching and
 *          attribution scoring step. Verifies CRON_SECRET header, runs
 *          runMatchProducts() in batches of 50 embeddings (default), returns
 *          JSON stats. Wrapped with pino logger and Sentry capture.
 *
 * Env vars required:
 *   CRON_SECRET               — Random 32-char secret
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   VISION_AUTO_ATTRIBUTE_THRESHOLD  — default 0.75; raise to 0.80 if precision drops
 *   VISION_REVIEW_THRESHOLD          — default 0.50
 *
 * Cron schedule: 0 *\/2 * * * (every 2 hours)
 * Vercel cron path: /api/cron/match-products
 *
 * Example invocation (local test):
 *   curl -X POST http://localhost:3000/api/cron/match-products \
 *     -H "x-cron-secret: $CRON_SECRET"
 */

import { type NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';
import { runMatchProducts } from '@/lib/ingestion/match-products';
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
    logger.warn({ path: '/api/cron/match-products' }, 'cron: unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const step = 'match-products';
  const transaction = Sentry.startTransaction({ name: `cron.${step}`, op: 'cron' });

  logger.info({ step, batch_size: DEFAULT_BATCH_SIZE }, 'cron: starting');

  let stats: CronStepStats | null = null;

  try {
    stats = await runMatchProducts(DEFAULT_BATCH_SIZE);

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

    // Alert if auto-attribution rate is suspiciously low (possible embedding regression)
    const details = stats.details as {
      auto_attributed?: number;
      review_queue?: number;
      no_match?: number;
    } | undefined;

    if (stats.processed > 10) {
      const autoRate = (details?.auto_attributed ?? 0) / stats.processed;
      if (autoRate < 0.1) {
        Sentry.captureMessage('match-products: auto-attribution rate < 10% — possible embedding regression', {
          level: 'warning',
          extra: { stats },
        });
        logger.warn({ auto_rate: autoRate, stats }, 'match-products: low auto-attribution rate');
      }
    }

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
