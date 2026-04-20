/**
 * /api/cron/celeb-scan — celebrity Instagram scan
 * Cron schedule: every 6 hours
 */

import { type NextRequest, NextResponse } from 'next/server';
import { captureError } from '@/lib/sentry';
import { logger } from '@/lib/logger';
import { runCelebScan } from '@/lib/vision/celeb-scan';
import type { CronStepStats } from '@/lib/vision/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const BATCH = parseInt(process.env.CRON_BATCH_SIZE ?? '50', 10);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let stats: CronStepStats | null = null;
  try {
    stats = await runCelebScan(BATCH);
    logger.info({ step: 'celeb-scan', processed: stats.processed, errors: stats.errors, ms: stats.duration_ms }, 'cron: complete');
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    captureError(err, { scope: 'cron.celeb-scan' });
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'cron: celeb-scan failed');
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return POST(request);
}
