import { NextRequest, NextResponse } from 'next/server';
import scrapedData from '@/data/scraped-feed.json';
import { toDbRow, upsertPosts, type RawScrapedPost, type IgPostDbRow } from '@/lib/feed-db';

/**
 * One-time seeder — loads the bundled scraped-feed.json into
 * Supabase `ig_posts`. Safe to re-run: upsert by `id` just merges.
 *
 * Gated by CRON_SECRET so random users can't trigger it.
 *
 * Usage:
 *   GET /api/admin/seed-feed?key=<CRON_SECRET>
 *   GET /api/admin/seed-feed?key=xxx&start=0&end=1000   (paginated)
 *   GET /api/admin/seed-feed?key=xxx&dryRun=1            (count without writing)
 */

export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || 'lenzy-cron-2026';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const key = searchParams.get('key');
  if (key !== CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const start = parseInt(searchParams.get('start') || '0');
  const end = parseInt(searchParams.get('end') || '5000');
  const dryRun = searchParams.get('dryRun') === '1';

  const raw = scrapedData as unknown as RawScrapedPost[];
  const slice = raw.slice(start, end);

  const rows: IgPostDbRow[] = [];
  let skipped = 0;
  for (const p of slice) {
    const row = toDbRow(p);
    if (row) rows.push(row);
    else skipped++;
  }

  if (dryRun) {
    return NextResponse.json({
      totalAvailable: raw.length,
      windowStart: start,
      windowEnd: Math.min(end, raw.length),
      windowSize: slice.length,
      wouldInsert: rows.length,
      skipped,
      sampleRow: rows[0] || null,
      dryRun: true,
    });
  }

  const result = await upsertPosts(rows);

  return NextResponse.json({
    totalAvailable: raw.length,
    windowStart: start,
    windowEnd: Math.min(end, raw.length),
    windowSize: slice.length,
    inserted: result.inserted,
    skipped,
    error: result.error,
    nextCursor: end < raw.length ? end : null,
  });
}
