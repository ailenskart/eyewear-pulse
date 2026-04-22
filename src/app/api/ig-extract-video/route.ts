/**
 * Instagram video-URL extractor.
 *
 * Mindcase's instagram/posts agent returns Display Image (thumbnail)
 * and Video Plays/Views counts for Video/Reel posts, but NOT the raw
 * MP4 URL. To play videos inline from our Vercel Blob we need to
 * recover that URL ourselves by scraping Instagram's public embed.
 *
 * GET  /api/ig-extract-video?shortCode=DW6rOrpDlpB
 * POST /api/ig-extract-video   body: { shortCode, postId? }
 *
 *   → { shortCode, videoUrl, blobUrl, size }
 *   → 404 { error: 'video_url not found in embed' } if IG blocks or
 *       markup has rotated; callers should fall back to thumbnail +
 *       link to IG.
 *
 * Behaviour is best-effort — IG rotates embed markup and rate-limits
 * server IPs. Treat any non-200 as "no video available" in the UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { downloadMedia, uploadToBlob, fetchIgVideoUrl } from '@/lib/blob';

export const maxDuration = 60;

async function handle(shortCode: string, postId?: string) {
  if (!shortCode) {
    return NextResponse.json({ error: 'shortCode required' }, { status: 400 });
  }

  const videoUrl = await fetchIgVideoUrl(shortCode);
  if (!videoUrl) {
    return NextResponse.json({ error: 'video_url not found in embed', shortCode }, { status: 404 });
  }

  const data = await downloadMedia(videoUrl, 25_000);
  if (!data) {
    return NextResponse.json({ videoUrl, error: 'download failed' }, { status: 502 });
  }

  const pid = postId || shortCode;
  const blobUrl = await uploadToBlob(data, `posts/video_${pid}.mp4`, 'video/mp4');
  if (!blobUrl) {
    return NextResponse.json({ videoUrl, error: 'blob upload failed' }, { status: 500 });
  }

  return NextResponse.json({ shortCode, videoUrl, blobUrl, size: data.byteLength });
}

export async function GET(request: NextRequest) {
  const shortCode = request.nextUrl.searchParams.get('shortCode') || '';
  const postId = request.nextUrl.searchParams.get('postId') || undefined;
  return handle(shortCode, postId);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { shortCode?: string; postId?: string };
  return handle(body.shortCode || '', body.postId);
}
