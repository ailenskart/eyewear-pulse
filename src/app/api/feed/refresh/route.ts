import { NextResponse } from 'next/server';

/**
 * Manual feed refresh — triggered by the refresh button in the UI.
 *
 * Fires the fast-tier rescrape in the background so the UI can
 * immediately return success and re-poll `/api/feed` a few seconds
 * later without waiting for the full 20-60s Apify round-trip.
 *
 * The secret is server-side only — the client never sees it.
 */

export const maxDuration = 5;

const CRON_SECRET = process.env.CRON_SECRET || 'lenzy-cron-2026';

export async function POST() {
  const origin = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  const url = `${origin}/api/cron/rescrape?tier=fast&key=${CRON_SECRET}`;

  // Fire-and-forget — don't await the full scrape, just kick it off.
  // The UI will poll /api/feed in a few seconds to see the new posts.
  fetch(url, { method: 'GET' }).catch(() => { /* best-effort */ });

  return NextResponse.json({
    success: true,
    message: 'Refresh started — new posts will appear in ~30s.',
    startedAt: new Date().toISOString(),
  });
}
