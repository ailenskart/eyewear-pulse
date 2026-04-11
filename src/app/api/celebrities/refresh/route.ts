import { NextResponse } from 'next/server';

/**
 * Manual celebrity feed refresh — fires the celebrity cron in the
 * background so the user doesn't wait for the full ~2-3 min scan of
 * 10 celebs. Secret is server-side only.
 */

export const maxDuration = 5;

const CRON_SECRET = process.env.CRON_SECRET || 'lenzy-cron-2026';

export async function POST() {
  const origin = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  const url = `${origin}/api/cron/celebrities?n=10&key=${CRON_SECRET}`;

  // Fire-and-forget — the UI polls /api/celebrities/feed shortly after.
  fetch(url, { method: 'GET' }).catch(() => { /* best-effort */ });

  return NextResponse.json({
    success: true,
    message: 'Celebrity scan started — new photos will appear in ~2 min.',
    startedAt: new Date().toISOString(),
  });
}
