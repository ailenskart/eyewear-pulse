/**
 * CLIP image embeddings via Replicate.
 *
 * Model: krthr/clip-embeddings (CLIP ViT-L/14, 768-dim).
 * Returns one 768-float vector per image so we can cluster visually
 * near-identical frames ("the same frame worn by many people") rather
 * than bucketing by attribute tags.
 *
 *   https://replicate.com/krthr/clip-embeddings
 */

const REPLICATE_BASE = 'https://api.replicate.com/v1';
const CLIP_VERSION = '1c0371070cb827ec3c7f2f28adcdde54b50dcd239aa6faea0bc98b174ef03fb4';
export const CLIP_MODEL = 'clip-vit-l14';
export const CLIP_DIM = 768;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Instagram's CDN blocks Replicate's egress IPs, so route IG/FB CDN URLs
 * through our own /api/img proxy (same trick as src/lib/vision.ts). Blob
 * and other URLs pass through untouched.
 */
export function modelFriendlyUrl(url: string): string {
  if (!url) return url;
  if (url.includes('blob.vercel-storage.com')) return url;
  if (!url.includes('cdninstagram.com') && !url.includes('fbcdn.net')) return url;
  return `https://lenzy.studio/api/img?url=${encodeURIComponent(url)}`;
}

interface Prediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: { embedding?: number[] } | number[] | null;
  error?: string | null;
}

function readEmbedding(out: Prediction['output']): number[] | null {
  if (!out) return null;
  if (Array.isArray(out)) return out.length === CLIP_DIM ? out : null;
  if (Array.isArray(out.embedding)) return out.embedding;
  return null;
}

/** Embed a single image URL. Returns null on any failure. */
export async function embedImageClip(rawUrl: string, token: string): Promise<number[] | null> {
  const image = modelFriendlyUrl(rawUrl);
  if (!image) return null;
  try {
    const res = await fetch(`${REPLICATE_BASE}/predictions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=30',
      },
      body: JSON.stringify({ version: CLIP_VERSION, input: { image } }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    let pred = (await res.json()) as Prediction;

    const start = Date.now();
    while (pred.status !== 'succeeded' && pred.status !== 'failed' && pred.status !== 'canceled') {
      if (Date.now() - start > 40_000) break;
      await sleep(1200);
      const pr = await fetch(`${REPLICATE_BASE}/predictions/${pred.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!pr.ok) break;
      pred = (await pr.json()) as Prediction;
    }
    if (pred.status !== 'succeeded') return null;
    return readEmbedding(pred.output);
  } catch {
    return null;
  }
}

/**
 * Embed many images with bounded concurrency. Returns a map keyed by the
 * caller's id; failed images are simply absent from the map.
 */
export async function embedImagesClip(
  images: Array<{ id: string; url: string }>,
  token: string,
  concurrency = 6,
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (images.length === 0) return out;
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= images.length) return;
      const img = images[i];
      const vec = await embedImageClip(img.url, token);
      if (vec) out.set(img.id, vec);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, images.length) }, worker));
  return out;
}
