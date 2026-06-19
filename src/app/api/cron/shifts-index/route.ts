import { NextRequest, NextResponse } from 'next/server';
import { hasEnv } from '@/lib/env';
import { embedPendingBatch } from '@/lib/shifts-embed';

/**
 * Cron: keep the Shifts visual index filled.
 *
 * Loops the image-embedding backfill within its time budget — IG posts
 * first (the lead lane), then products — so the index self-populates and
 * stays fresh as new posts/products arrive. No manual curl needed once
 * REPLICATE_API_TOKEN is set.
 *
 * Auth: ?key=<CRON_SECRET> OR Authorization: Bearer <CRON_SECRET>
 */

export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET || 'lenzy-cron-2026';
const BATCH = 120;
const TIME_BUDGET_MS = 250_000; // leave headroom under maxDuration

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  const authHeader = request.headers.get('authorization');
  if (key !== CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasEnv('REPLICATE_API_TOKEN')) {
    return NextResponse.json({ error: 'REPLICATE_API_TOKEN not set', skipped: true }, { status: 200 });
  }

  const start = Date.now();
  const totals: Record<string, { embedded: number; failed: number }> = {
    ig_post: { embedded: 0, failed: 0 },
    product: { embedded: 0, failed: 0 },
  };

  for (const type of ['ig_post', 'product']) {
    while (Date.now() - start < TIME_BUDGET_MS) {
      const r = await embedPendingBatch(type, BATCH);
      totals[type].embedded += r.embedded;
      totals[type].failed += r.failed;
      if (!r.hadMore) break;
    }
  }

  return NextResponse.json({ ok: true, ms: Date.now() - start, totals });
}
