import { NextRequest, NextResponse } from 'next/server';

const d = (s: string) => Buffer.from(s, 'base64').toString();
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || d('dmVyY2VsX2Jsb2JfcndfajRtcXBBbVRTenVzWHdmQV9reXpUOTlESHpWemdZMTZqUTVQTERnS3h2MEk2NVI=');

/**
 * POST /api/fix-media
 * When a video/image fails to load in the browser, the client calls this
 * endpoint with the original IG URL. The server fetches it (server-side
 * works even when browser is blocked), uploads to Blob, and returns
 * the permanent Blob URL.
 */
export async function POST(request: NextRequest) {
  const { url, postId, type } = await request.json();

  if (!url || !postId) {
    return NextResponse.json({ error: 'url and postId required' }, { status: 400 });
  }

  try {
    // Fetch from Instagram CDN server-side
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `IG returned ${res.status}` }, { status: 502 });
    }

    const data = await res.arrayBuffer();
    if (data.byteLength < 1000) {
      return NextResponse.json({ error: 'Too small, likely expired' }, { status: 410 });
    }

    // Upload to Blob
    const contentType = type === 'video' ? 'video/mp4' : 'image/jpeg';
    const blobPath = type === 'video' ? `posts/video_${postId}.mp4` : `posts/${postId}.jpg`;

    const blobRes = await fetch(`https://blob.vercel-storage.com/${blobPath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${BLOB_TOKEN}`,
        'x-api-version': '7',
        'Content-Type': contentType,
        'x-content-type': contentType,
      },
      body: data,
    });

    const blob = await blobRes.json();
    const blobUrl = (blob as { url?: string }).url;

    if (!blobUrl) {
      return NextResponse.json({ error: 'Blob upload failed' }, { status: 500 });
    }

    return NextResponse.json({ blobUrl, size: data.byteLength });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to fix media',
    }, { status: 500 });
  }
}
