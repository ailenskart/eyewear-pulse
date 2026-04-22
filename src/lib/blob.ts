/**
 * Shared media-download + Vercel Blob upload helpers.
 *
 * Extracted so multiple scrapers (Apify cron, Mindcase cron, ad-hoc
 * backfill) behave identically: same retry + size guards, same
 * fail-open behaviour when the blob token is missing.
 */

import { env } from './env';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function downloadMedia(url: string, timeoutMs = 15_000): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'image/*,video/*,*/*' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return buf.byteLength > 500 ? buf : null;
  } catch {
    return null;
  }
}

export async function uploadToBlob(
  data: ArrayBuffer,
  path: string,
  contentType: string,
): Promise<string | null> {
  const token = env.BLOB_READ_WRITE_TOKEN();
  if (!token) return null;
  try {
    const res = await fetch(`https://blob.vercel-storage.com/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-api-version': '7',
        'Content-Type': contentType,
        'x-content-type': contentType,
      },
      body: data,
    });
    const json = await res.json();
    return (json as { url?: string }).url || null;
  } catch {
    return null;
  }
}

/**
 * Convenience: download then upload. Returns the public Blob URL, or
 * null if either step fails. Good for ad-hoc backfills.
 */
export async function rehostImage(url: string, blobPath: string, contentType = 'image/jpeg'): Promise<string | null> {
  const data = await downloadMedia(url);
  if (!data) return null;
  return uploadToBlob(data, blobPath, contentType);
}

/* ─── Instagram video-URL extraction via public embed ─── */
/* Mindcase's IG posts agent doesn't return MP4 URLs for Video/Reel
   posts, so we fall back to scraping the public embed page, which
   still works for public accounts without auth. */

function unescapeJsonString(s: string): string {
  return s
    .replace(/\\u0026/g, '&')
    .replace(/\\u0025/g, '%')
    .replace(/\\u003d/g, '=')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"');
}

export function parseVideoUrlFromEmbed(html: string): string | null {
  const patterns = [
    /"video_url":"([^"]+\.mp4[^"]*)"/,
    /"playable_url_quality_hd":"([^"]+\.mp4[^"]*)"/,
    /"playable_url":"([^"]+\.mp4[^"]*)"/,
    /"contentUrl":"([^"]+\.mp4[^"]*)"/,
    /<meta\s+property="og:video"\s+content="([^"]+)"/,
    /<meta\s+property="og:video:secure_url"\s+content="([^"]+)"/,
  ];
  for (const pat of patterns) {
    const m = html.match(pat);
    if (m?.[1]) {
      const url = unescapeJsonString(m[1]);
      if (url.startsWith('http')) return url;
    }
  }
  return null;
}

export async function fetchIgVideoUrl(shortCode: string): Promise<string | null> {
  const urls = [
    `https://www.instagram.com/p/${shortCode}/embed/captioned/`,
    `https://www.instagram.com/reel/${shortCode}/embed/captioned/`,
    `https://www.instagram.com/p/${shortCode}/embed/`,
  ];
  for (const u of urls) {
    try {
      const res = await fetch(u, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      if (html.length < 1000) continue;
      const url = parseVideoUrlFromEmbed(html);
      if (url) return url;
    } catch {
      /* try next */
    }
  }
  return null;
}
