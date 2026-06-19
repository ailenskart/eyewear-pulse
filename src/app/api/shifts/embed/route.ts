import { NextRequest, NextResponse } from 'next/server';
import { hasEnv } from '@/lib/env';
import { embedPendingBatch } from '@/lib/shifts-embed';

/**
 * Manual image-embedding backfill for the Shifts visual index.
 * Idempotent + resumable — call until `hadMore` is false.
 *
 * Auth: ?key=<CRON_SECRET> OR Authorization: Bearer <CRON_SECRET>
 *   GET /api/shifts/embed?key=xxx&type=ig_post&limit=120
 */

export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET || 'lenzy-cron-2026';

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  const authHeader = request.headers.get('authorization');
  if (key !== CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasEnv('REPLICATE_API_TOKEN')) {
    return NextResponse.json({ error: 'REPLICATE_API_TOKEN not set' }, { status: 400 });
  }

  const type = request.nextUrl.searchParams.get('type') || 'ig_post';
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '120'), 400);
  const result = await embedPendingBatch(type, limit);
  return NextResponse.json({ type, ...result });
}
