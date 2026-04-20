/**
 * /api/cron/match-products — pgvector cosine match + attribution scoring
 * Cron schedule: every 2 hours
 */

import { type NextRequest, NextResponse } from 'next/server';
import { captureError } from '@/lib/sentry';
import { logger } from '@/lib/logger';
import { runMatchProducts } from '@/lib/vision/match-products';
import type { CronStepStats } from '@/lib/vision/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const BATCH = parseInt(process.env.CRON_BATCH_SIZE ?? '50', 10);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stats = await runMatchProducts(BATCH);
    logger.info({ step: 'match-products', processed: stats.processed, errors: stats.errors, ms: stats.duration_ms }, 'cron: complete');
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    captureError(err, { scope: 'cron.match-products' });
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'cron: match-products failed');
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return POST(request);
}
