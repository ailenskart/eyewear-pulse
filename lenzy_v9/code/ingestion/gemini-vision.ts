/**
 * gemini-vision.ts — Gemini Vision wrapper for eyewear detection
 *
 * Purpose: Calls the Gemini Vision API with structured output (responseSchema)
 *          to detect eyewear in images. Returns a typed GeminiVisionResponse.
 *          Handles retries, timeouts, JSON parse failures, and budget tracking.
 *
 * Env vars required:
 *   GEMINI_API_KEY          — Google AI Studio API key (no base64 fallback)
 *   UPSTASH_REDIS_REST_URL  — Redis URL for budget counters
 *   UPSTASH_REDIS_REST_TOKEN — Redis token
 *
 * Example invocation:
 *   const result = await detectEyewear('https://blob.vercel-storage.com/posts/123.jpg');
 *   if (result.ok) { console.log(result.data.eyewear_present); }
 *
 * Cron schedule: called from vision-detect/route.ts (every 2h)
 */

import { logger } from '@/lib/logger';
import type { GeminiVisionResponse } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GEMINI_MODEL = 'gemini-2.0-flash-exp';
const GEMINI_FALLBACK_MODEL = 'gemini-1.5-pro';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

const REDIS_BUDGET_KEY_PREFIX = 'lenzy:budget:gemini';
const DAILY_GEMINI_CALL_LIMIT = parseInt(process.env.DAILY_GEMINI_CALL_LIMIT ?? '5000', 10);

// ---------------------------------------------------------------------------
// Env validation
// ---------------------------------------------------------------------------

function assertEnv(): void {
  const required = ['GEMINI_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`gemini-vision: missing required env vars: ${missing.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// Budget guard
// ---------------------------------------------------------------------------

async function incrementGeminiBudget(): Promise<{ allowed: boolean; used: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${REDIS_BUDGET_KEY_PREFIX}:${today}`;
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/incr/${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN!}` },
    });
    if (!res.ok) return { allowed: true, used: 0 };

    const json = (await res.json()) as { result: number };
    const used = json.result;

    if (used === 1) {
      await fetch(
        `${process.env.UPSTASH_REDIS_REST_URL}/expire/${encodeURIComponent(key)}/90000`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN!}` },
        },
      );
    }

    return { allowed: used <= DAILY_GEMINI_CALL_LIMIT, used };
  } catch {
    return { allowed: true, used: 0 };
  }
}

// ---------------------------------------------------------------------------
// Gemini response schema for structured output
// ---------------------------------------------------------------------------

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    eyewear_present: { type: 'boolean' },
    confidence: { type: 'number' },
    eyewear_regions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          bbox: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
            },
            required: ['x', 'y', 'width', 'height'],
          },
          shape: { type: 'string' },
          color: { type: 'string' },
          material: { type: 'string' },
          lens_type: { type: 'string' },
          lens_color: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['bbox', 'shape', 'color', 'material', 'lens_type', 'confidence'],
      },
    },
    face_regions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          bbox: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
            },
          },
          has_eyewear: { type: 'boolean' },
        },
      },
    },
  },
  required: ['eyewear_present', 'confidence', 'eyewear_regions', 'face_regions'],
};

// ---------------------------------------------------------------------------
// Detection prompt
// ---------------------------------------------------------------------------

const DETECTION_PROMPT = `You are an eyewear detection specialist. Analyze the provided image carefully.

Your task:
1. Determine if any eyewear (sunglasses, optical frames, sports glasses) is visible on any person in the image.
2. For each eyewear item detected, identify its bounding box, shape, color, material, and lens type.
3. For each face visible, provide a bounding box.

Return ONLY a JSON object matching the schema below. Do not include any text outside the JSON.

Schema:
{
  "eyewear_present": boolean,
  "confidence": number,
  "eyewear_regions": [{
    "bbox": { "x": number, "y": number, "width": number, "height": number },
    "shape": "aviator"|"wayfarer"|"round"|"cat-eye"|"square"|"oversized"|"shield"|"sport"|"geometric"|"other",
    "color": string,
    "material": "acetate"|"metal"|"titanium"|"wood"|"plastic"|"mixed"|"unknown",
    "lens_type": "tinted"|"mirrored"|"clear"|"photochromic"|"polarized"|"unknown",
    "lens_color": string,
    "confidence": number
  }],
  "face_regions": [{
    "bbox": { "x": number, "y": number, "width": number, "height": number },
    "has_eyewear": boolean
  }]
}

If eyewear_present is false, return eyewear_regions: [] and set confidence accordingly.
Normalize all bounding box coordinates to 0.0-1.0 relative to image dimensions.`;

// ---------------------------------------------------------------------------
// Fetch with timeout
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Image fetching — converts URL to base64 for Gemini inline_data
// ---------------------------------------------------------------------------

async function fetchImageAsBase64(
  imageUrl: string,
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetchWithTimeout(imageUrl, {}, 15_000);
    if (!res.ok) {
      logger.warn({ imageUrl, status: res.status }, 'gemini-vision: image fetch failed');
      return null;
    }
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const buffer = await res.arrayBuffer();
    const data = Buffer.from(buffer).toString('base64');
    return { data, mimeType: contentType.split(';')[0] };
  } catch (err) {
    logger.error({ imageUrl, err }, 'gemini-vision: image fetch threw');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type DetectEyewearResult =
  | { ok: true; data: GeminiVisionResponse; model: string }
  | { ok: false; error: string };

/**
 * Run Gemini Vision eyewear detection on an image URL.
 * The image is fetched and sent as inline_data (base64) to avoid URL
 * expiry issues with Instagram CDN links.
 */
export async function detectEyewear(imageUrl: string): Promise<DetectEyewearResult> {
  assertEnv();

  const { allowed, used } = await incrementGeminiBudget();
  if (!allowed) {
    return { ok: false, error: `Daily Gemini budget exceeded (used: ${used})` };
  }

  const imageData = await fetchImageAsBase64(imageUrl);
  if (!imageData) {
    return { ok: false, error: `Could not fetch image from: ${imageUrl}` };
  }

  let lastError = '';
  let model = GEMINI_MODEL;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Fall back to Pro model on 3rd attempt
    if (attempt === 3) {
      model = GEMINI_FALLBACK_MODEL;
    }

    try {
      const endpoint = `${GEMINI_API_BASE}/${model}:generateContent?key=${process.env.GEMINI_API_KEY!}`;

      const body = {
        contents: [
          {
            parts: [
              { text: DETECTION_PROMPT },
              {
                inline_data: {
                  mime_type: imageData.mimeType,
                  data: imageData.data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0,
          maxOutputTokens: 1024,
        },
      };

      logger.info({ model, attempt, imageUrl: imageUrl.slice(0, 60) }, 'gemini-vision: calling API');

      const res = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      );

      if (!res.ok) {
        const errText = await res.text();
        lastError = `Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`;
        logger.warn({ model, attempt, status: res.status, err: lastError }, 'gemini-vision: API error');

        if (res.status === 429) {
          await sleep(attempt * 4000);
        } else if (res.status >= 500) {
          await sleep(attempt * 2000);
        } else {
          // 4xx (other than 429) — not retryable
          return { ok: false, error: lastError };
        }
        continue;
      }

      interface GeminiAPIResponse {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      }

      const json = (await res.json()) as GeminiAPIResponse;
      const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      if (!rawText) {
        lastError = 'Gemini returned empty response';
        logger.warn({ model, attempt }, lastError);
        await sleep(attempt * 1000);
        continue;
      }

      let parsed: GeminiVisionResponse;
      try {
        parsed = JSON.parse(rawText) as GeminiVisionResponse;
      } catch {
        lastError = `JSON parse failed: ${rawText.slice(0, 200)}`;
        logger.warn({ model, attempt, rawText: rawText.slice(0, 200) }, 'gemini-vision: JSON parse error');
        // Write a sentinel value — the row will be re-tried once, then marked as parse_failed
        if (attempt === MAX_RETRIES) {
          return { ok: false, error: `parse_failed:${lastError}` };
        }
        await sleep(attempt * 1000);
        continue;
      }

      // Validate required fields
      if (typeof parsed.eyewear_present !== 'boolean') {
        lastError = 'Response missing eyewear_present field';
        logger.warn({ model, attempt }, lastError);
        await sleep(attempt * 1000);
        continue;
      }

      logger.info(
        {
          model,
          attempt,
          eyewear_present: parsed.eyewear_present,
          regions: parsed.eyewear_regions?.length ?? 0,
        },
        'gemini-vision: detection complete',
      );

      return { ok: true, data: parsed, model };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (lastError.includes('AbortError') || lastError.includes('abort')) {
        lastError = `Gemini request timed out after ${REQUEST_TIMEOUT_MS}ms`;
      }
      logger.error({ model, attempt, err: lastError }, 'gemini-vision: call threw');
      await sleep(attempt * 2000);
    }
  }

  return { ok: false, error: lastError };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
