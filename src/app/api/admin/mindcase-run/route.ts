import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { runAgent, isMindcaseConfigured } from '@/lib/mindcase';

/**
 * Generic Mindcase runner. Lets any of the 30+ agents be invoked via a
 * single authenticated endpoint, so you can crawl LinkedIn, YouTube,
 * TikTok, Reddit, Twitter, Amazon, Google Maps, etc. without shipping
 * a dedicated route per platform.
 *
 * Auth: ?key=<CRON_SECRET> OR Authorization: Bearer <CRON_SECRET>
 *
 * POST /api/admin/mindcase-run?key=xxx
 * Body: {
 *   "agent":  "linkedin/company-search",      // required, group/slug
 *   "params": { "searchQuery": "eyewear" },   // required, per-agent schema
 *   "store":  "brand_content" | "none",       // optional, default "none"
 *   "contentType": "linkedin_post",           // required if store=brand_content
 *   "handle": "rayban"                        // optional, sets brand_handle on stored rows
 * }
 *
 * When store="none" (default), the raw rows come back in the response —
 * handy for curl-powered exploration before writing a dedicated
 * ingester. When store="brand_content", each row is upserted with a
 * stable source_ref so re-runs are idempotent.
 */

export const maxDuration = 800;

const CRON_SECRET = process.env.CRON_SECRET || 'lenzy-cron-2026';

interface Body {
  agent: string;
  params: Record<string, unknown>;
  store?: 'brand_content' | 'none';
  contentType?: string;
  handle?: string;
  brandId?: number;
}

function deriveSourceRef(row: Record<string, unknown>, fallbackIndex: number): string {
  const candidates = ['id', 'post_id', 'postId', 'video_id', 'videoId', 'url', 'permalink', 'shortcode', 'shortCode'];
  for (const k of candidates) {
    const v = row[k];
    if (typeof v === 'string' && v) return v;
    if (typeof v === 'number') return String(v);
  }
  return `idx_${fallbackIndex}_${Date.now()}`;
}

function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v) return v;
  }
  return null;
}

function pickNumber(row: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v && !isNaN(Number(v))) return Number(v);
  }
  return 0;
}

export async function POST(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  const authHeader = request.headers.get('authorization');
  if (key !== CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isMindcaseConfigured()) {
    return NextResponse.json({ error: 'MINDCASE_API_KEY not set' }, { status: 500 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body.agent || !body.params) {
    return NextResponse.json({ error: 'agent and params are required' }, { status: 400 });
  }

  const startedAt = Date.now();
  let rows: Record<string, unknown>[] = [];
  try {
    const result = await runAgent(body.agent, body.params, { timeoutSec: 600 });
    rows = result.data || [];
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Mindcase run failed',
    }, { status: 502 });
  }

  if (body.store !== 'brand_content') {
    return NextResponse.json({
      agent: body.agent,
      rowCount: rows.length,
      durationMs: Date.now() - startedAt,
      data: rows,
    });
  }

  // Store into brand_content
  if (!body.contentType) {
    return NextResponse.json({ error: 'contentType required when store=brand_content' }, { status: 400 });
  }
  const client = supabaseServer();
  const contentRows = rows.map((r, idx) => ({
    brand_id: body.brandId || null,
    brand_handle: body.handle || pickString(r, ['username', 'ownerUsername', 'handle', 'owner_username']) || null,
    type: body.contentType,
    source: 'mindcase',
    source_ref: deriveSourceRef(r, idx),
    caption: pickString(r, ['caption', 'text', 'description', 'title']),
    url: pickString(r, ['url', 'permalink', 'post_url', 'profile_url']),
    image_url: pickString(r, ['displayUrl', 'display_url', 'media_url', 'image', 'image_url', 'thumbnail']),
    video_url: pickString(r, ['videoUrl', 'video_url']),
    likes: pickNumber(r, ['likes', 'likesCount', 'likes_count', 'like_count']),
    comments: pickNumber(r, ['comments', 'commentsCount', 'comments_count', 'comment_count']),
    engagement: 0,
    hashtags: Array.isArray(r.hashtags) ? (r.hashtags as string[]) : [],
    posted_at: pickString(r, ['timestamp', 'posted_at', 'created_at', 'published_at']),
    data: r,
  }));

  const BATCH = 500;
  let inserted = 0;
  let upsertError: string | null = null;
  for (let i = 0; i < contentRows.length; i += BATCH) {
    const slice = contentRows.slice(i, i + BATCH);
    const { error } = await client.from('brand_content').upsert(slice, {
      onConflict: 'brand_id,type,source,source_ref',
      ignoreDuplicates: false,
    });
    if (error) { upsertError = error.message; break; }
    inserted += slice.length;
  }

  return NextResponse.json({
    agent: body.agent,
    rowCount: rows.length,
    inserted,
    upsertError,
    durationMs: Date.now() - startedAt,
  });
}
