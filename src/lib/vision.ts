/**
 * Open-source vision classifier: is this person wearing eyewear?
 *
 * Uses Moondream 2 (2B params, open weights) hosted on Replicate —
 * cheaper than Gemini Vision, faster warm, no Google dependency, and
 * returns both a yes/no verdict and a free-form description in one
 * call. Replaces the Gemini-based detectEyewearBatch() previously
 * used in the celebrity Instagram scanner.
 *
 * Model: https://replicate.com/lucataco/moondream2
 * Cost:  ~$0.0002/image as of April 2026
 * Speed: ~1-3s per image once warm, ~30s cold start
 *
 * Usage:
 *   const result = await detectEyewear(imageUrl);
 *   if (result.isWearing) console.log(result.description);
 */

import { env } from './env';

const REPLICATE_BASE = 'https://api.replicate.com/v1';

// Moondream 2 on Replicate — slug lucataco/moondream2, current
// version hash scraped from replicate.com/lucataco/moondream2/versions.
// Community models can't be invoked via /v1/models/<slug>/predictions
// (that endpoint is only for "official" Replicate models), so we call
// /v1/predictions with an explicit version. Bump the hash below when
// you want newer weights.
const MOONDREAM_VERSION = '72ccb656353c348c1385df54b237eeb7bfa874bf11486cf0b9473e691b662d31';

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface EyewearDetection {
  isWearing: boolean;
  description: string | null;
  raw: string;
  /** Populated when the API call fails — helps diagnose which stage. */
  error?: string;
}

/**
 * Run Moondream on a single image with a targeted prompt. Returns
 * parsed isWearing + eyewear description (shape/color/brand-hints)
 * when present. Returns { isWearing: false, raw: '' } on any failure.
 */
export async function detectEyewear(imageUrl: string): Promise<EyewearDetection> {
  // Use the env helper (required()) rather than process.env directly —
  // Next.js 16 otherwise tree-shakes the env var out of this bundle
  // because vision.ts is only reached via a dynamic import from the
  // celebrity scanner, so it doesn't look like a statically-used env.
  let token = '';
  try { token = env.REPLICATE_API_TOKEN(); } catch { return { isWearing: false, description: null, raw: '', error: 'no REPLICATE_API_TOKEN' }; }
  if (!token) return { isWearing: false, description: null, raw: '', error: 'empty token' };

  const prompt = [
    'Is the main person VISIBLY wearing sunglasses or eyeglasses ON THEIR FACE in this photo?',
    'Answer in this exact format:',
    'YES — <short description: shape + color + any visible brand clues, under 100 characters>',
    'or',
    'NO',
    '',
    'Rules:',
    '- YES only if glasses are clearly on the face.',
    '- Glasses held in hand, pushed onto head, on a table, worn by someone else = NO.',
    '- Shaded eye makeup / squinting / face covered by a hand = NO.',
  ].join('\n');

  try {
    const createRes = await fetch(`${REPLICATE_BASE}/predictions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=30',
      },
      body: JSON.stringify({
        version: MOONDREAM_VERSION,
        input: { image: imageUrl, prompt },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => '');
      return { isWearing: false, description: null, raw: '', error: `replicate ${createRes.status}: ${errText.slice(0, 200)}` };
    }
    let pred = await createRes.json() as ReplicatePrediction;

    // Poll until terminal — `Prefer: wait=30` above usually makes the
    // first response terminal for Moondream, but handle the polling
    // path for safety on cold starts.
    const start = Date.now();
    while (pred.status !== 'succeeded' && pred.status !== 'failed' && pred.status !== 'canceled') {
      if (Date.now() - start > 45_000) break;
      await sleep(1500);
      const pollRes = await fetch(`${REPLICATE_BASE}/predictions/${pred.id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!pollRes.ok) break;
      pred = await pollRes.json() as ReplicatePrediction;
    }

    if (pred.status !== 'succeeded' || !pred.output) {
      return { isWearing: false, description: null, raw: '', error: `status=${pred.status} err=${pred.error || 'n/a'}` };
    }

    const text = Array.isArray(pred.output) ? pred.output.join('') : String(pred.output);
    return parseEyewearReply(text);
  } catch (err) {
    return { isWearing: false, description: null, raw: '', error: err instanceof Error ? err.message : 'exception' };
  }
}

export function parseEyewearReply(raw: string): EyewearDetection {
  const text = raw.trim();
  const isWearing = /^\s*YES\b/i.test(text);
  if (!isWearing) return { isWearing: false, description: null, raw: text };
  // Extract whatever follows "YES —" or "YES:" or "YES -" or just "YES"
  const m = text.match(/^\s*YES[\s\-—:,.]+([\s\S]+)$/i);
  const description = m ? m[1].trim().slice(0, 140) : null;
  return { isWearing: true, description, raw: text };
}

/**
 * Batch helper — runs detectEyewear for each image with a bounded
 * concurrency. Returns a Map keyed by the caller's id so the caller
 * can look up results without juggling array indices.
 */
export async function detectEyewearBatch(
  photos: Array<{ id: string; imageUrl: string }>,
  concurrency = 4,
): Promise<Map<string, EyewearDetection>> {
  const out = new Map<string, EyewearDetection>();
  if (photos.length === 0) return out;
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= photos.length) return;
      const p = photos[i];
      const result = await detectEyewear(p.imageUrl);
      out.set(p.id, result);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, photos.length) }, worker));
  return out;
}

