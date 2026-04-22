import { NextRequest, NextResponse } from 'next/server';
import { detectEyewear } from '@/lib/vision';

/**
 * Debug passthrough for the open-source eyewear classifier.
 * Hit this to see Moondream's raw reply + our parse so we can
 * diagnose false-negatives before touching the celeb cron.
 *
 *   GET /api/admin/vision-probe?key=…&url=<imageUrl>
 *
 * Auth: ?key=<CRON_SECRET>
 */

export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || 'lenzy-cron-2026';

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (key !== CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'url param required' }, { status: 400 });
  }

  const startedAt = Date.now();
  const result = await detectEyewear(url);
  return NextResponse.json({
    ...result,
    durationMs: Date.now() - startedAt,
    hasReplicateToken: !!process.env.REPLICATE_API_TOKEN,
  });
}
