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

/** Debug: return a snapshot of what each IG embed variant serves and
 *  any candidate video-URL substrings so we can see what regex to use. */
export async function debugFetchIgEmbed(shortCode: string): Promise<{
  attempts: Array<{
    url: string;
    status: number;
    size: number;
    foundVideoUrl: string | null;
    candidates: string[];
    mp4Matches: string[];
  }>;
}> {
  const urls = [
    `https://www.instagram.com/p/${shortCode}/embed/captioned/`,
    `https://www.instagram.com/reel/${shortCode}/embed/captioned/`,
    `https://www.instagram.com/p/${shortCode}/embed/`,
  ];
  const attempts: Array<{
    url: string;
    status: number;
    size: number;
    foundVideoUrl: string | null;
    candidates: string[];
    mp4Matches: string[];
  }> = [];

  const fieldPatterns = [
    /"video_url":[^,}]{0,200}/g,
    /"playable_url[_a-z]*":[^,}]{0,200}/g,
    /"contentUrl":[^,}]{0,200}/g,
    /<video[^>]*src="[^"]{0,300}"/gi,
    /og:video[^>]*content="[^"]{0,300}"/gi,
    /playlist_url[^"]{0,80}"[^"]{0,300}"/gi,
    /dash_manifest[^"]{0,80}/gi,
    /video_versions/gi,
    /"__typename":"XDT[^"]+"/g,
    /is_video["':]{0,5}true/g,
    /has_audio["':]{0,5}true/g,
    /application\/vnd\.apple\.mpegurl/gi,
    /m3u8/gi,
    /\.mp4/g,
  ];
  const mp4Pattern = /https?:\/\/[^\s"'<>]{0,400}\.mp4[^\s"'<>]{0,400}/g;

  for (const u of urls) {
    try {
      const res = await fetch(u, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(15_000),
      });
      const html = await res.text();
      const candidates: string[] = [];
      for (const p of fieldPatterns) {
        const matches = html.match(p) || [];
        for (const m of matches.slice(0, 3)) candidates.push(m.slice(0, 200));
      }
      const mp4Matches = (html.match(mp4Pattern) || []).slice(0, 5).map(m => m.slice(0, 300));
      const foundVideoUrl = parseVideoUrlFromEmbed(html);
      attempts.push({
        url: u,
        status: res.status,
        size: html.length,
        foundVideoUrl,
        candidates,
        mp4Matches,
      });
    } catch (err) {
      attempts.push({
        url: u,
        status: 0,
        size: 0,
        foundVideoUrl: null,
        candidates: [err instanceof Error ? err.message : 'fetch error'],
        mp4Matches: [],
      });
    }
  }
  return { attempts };
}

async function fetchIgVideoUrlViaEmbed(shortCode: string): Promise<string | null> {
  // Instagram has fully stripped video URLs from their public embed
  // pages (confirmed April 2026 — 850KB HTML, no .mp4, no is_video,
  // no video_versions, no manifest). Kept as a first-try so if IG
  // ever re-exposes it we pick it up automatically.
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

async function fetchIgVideoUrlViaApify(shortCode: string): Promise<string | null> {
  // Apify's IG scraper (actor shu8hvrXbJbY3Eb9W) reliably returns
  // videoUrl for Video / Reel posts — this is the same actor that
  // produced the 670 video posts in our seed data with blob URLs.
  // Only fires when APIFY_TOKEN is set; returns null otherwise so
  // callers can gracefully degrade.
  try {
    const { runActor, isApifyConfigured, DEFAULT_ACTORS } = await import('./apify');
    if (!isApifyConfigured()) return null;
    const result = await runActor<{ videoUrl?: string; shortCode?: string }>(
      DEFAULT_ACTORS.instagram,
      {
        directUrls: [`https://www.instagram.com/p/${shortCode}/`],
        resultsType: 'posts',
        resultsLimit: 1,
      },
      { timeout: 60 },
    );
    if (!result.ok) return null;
    for (const item of result.items) {
      if (item?.videoUrl) return item.videoUrl;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchIgVideoUrl(shortCode: string): Promise<string | null> {
  // Try IG's own public embed first (free, instantaneous when it works),
  // then fall back to Apify (reliable, costs credits).
  const embed = await fetchIgVideoUrlViaEmbed(shortCode);
  if (embed) return embed;
  return fetchIgVideoUrlViaApify(shortCode);
}
