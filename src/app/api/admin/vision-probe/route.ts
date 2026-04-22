import { NextRequest, NextResponse } from 'next/server';
import { detectEyewear } from '@/lib/vision';
import { env } from '@/lib/env';

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
    hasReplicateToken: (() => { try { return !!env.REPLICATE_API_TOKEN(); } catch { return false; } })(),
    envProbe: {
      REPLICATE_API_TOKEN: !!process.env.REPLICATE_API_TOKEN,
      REPLICATE_TOKEN: !!process.env.REPLICATE_TOKEN,
      REPLICATE_API_KEY: !!process.env.REPLICATE_API_KEY,
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      MINDCASE_API_KEY: !!process.env.MINDCASE_API_KEY,
      APIFY_TOKEN: !!process.env.APIFY_TOKEN,
      BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
      // All env var NAMES starting with common prefixes (values hidden)
      allVars: Object.keys(process.env).filter(k =>
        /^(REPLICATE|GEMINI|OPENAI|MINDCASE|APIFY|BLOB|SUPABASE|CRON|VERCEL)/.test(k)
      ),
    },
  });
}
