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

  // Moondream 2 (1.86B) is a small VLM — complex multi-step prompts
  // confuse it. Keep the question sharp and binary. Describe-then-
  // classify is a separate second call when the answer is Yes, in
  // detectEyewear below.
  const prompt = 'Does the main person in this photo have sunglasses or prescription glasses covering their eyes right now? Answer only Yes or No. Glasses pushed up on the head, held in hand, on a table, or worn by someone else = No.';

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
    const verdict = parseEyewearReply(text);
    if (!verdict.isWearing) return verdict;

    // Second call — one-sentence eyewear description. Used both as a
    // label for the feed AND as a cheap sanity check. We only
    // downgrade the Yes on EXPLICIT negation ("no glasses" / "not
    // wearing") — otherwise trust the first call. Moondream's
    // description is often poetic and won't always name the frame
    // explicitly, so requiring an eyewear-keyword match was too strict
    // and nuked ~100% of detections in testing.
    const describe = await describeEyewear(imageUrl, token);
    if (describe && describe.isExplicitlyNoGlasses) {
      return { isWearing: false, description: null, raw: text, error: 'description call said no glasses' };
    }
    return {
      isWearing: true,
      description: describe?.text || null,
      raw: text,
    };
  } catch (err) {
    return { isWearing: false, description: null, raw: '', error: err instanceof Error ? err.message : 'exception' };
  }
}

/**
 * Second-pass description call. Runs only when the first call said
 * Yes. Asks Moondream to describe the eyewear; if it can't produce
 * an eyewear-related description, we treat the original Yes as a
 * false positive.
 */
async function describeEyewear(imageUrl: string, token: string): Promise<{ text: string | null; isExplicitlyNoGlasses: boolean } | null> {
  const prompt = 'Describe the glasses or sunglasses the main person is wearing in one short sentence. Mention shape, color, and any visible brand clues. If they are not wearing glasses, start the reply with "No glasses".';
  try {
    const res = await fetch(`${REPLICATE_BASE}/predictions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=30',
      },
      body: JSON.stringify({ version: MOONDREAM_VERSION, input: { image: imageUrl, prompt } }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    let pred = await res.json() as ReplicatePrediction;
    const start = Date.now();
    while (pred.status !== 'succeeded' && pred.status !== 'failed' && pred.status !== 'canceled') {
      if (Date.now() - start > 30_000) break;
      await sleep(1200);
      const pr = await fetch(`${REPLICATE_BASE}/predictions/${pred.id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!pr.ok) break;
      pred = await pr.json() as ReplicatePrediction;
    }
    if (pred.status !== 'succeeded' || !pred.output) return null;
    const text = (Array.isArray(pred.output) ? pred.output.join('') : String(pred.output)).trim();
    const lower = text.toLowerCase();
    // Only treat very explicit negations as "downgrade" signals. Any
    // other reply is treated as a description (even if Moondream gets
    // creative — we'd rather keep a slightly mis-described hit than
    // throw out genuine eyewear photos because the description didn't
    // hit an exact keyword.
    const isExplicitlyNoGlasses = /^no\s+glasses\b/i.test(text) || /\b(is|are)\s+not\s+wearing\s+(any\s+)?(glasses|sunglasses|eyewear)\b/.test(lower) || /\bno,?\s+(she|he|they)\s+(is|are)\s+not\b/i.test(text);
    return { text: text.slice(0, 140), isExplicitlyNoGlasses };
  } catch {
    return null;
  }
}

export function parseEyewearReply(raw: string): EyewearDetection {
  const text = raw.trim();
  // Accept any reply that starts with "Yes" (case-insensitive) — Moondream
  // almost always answers the binary question with just "Yes" or "No".
  const isWearing = /^\s*yes\b/i.test(text);
  return { isWearing, description: null, raw: text };
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

