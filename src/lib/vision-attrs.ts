/**
 * Frame-attribute extraction via Gemini Vision.
 *
 * Given a set of images, returns structured frame attributes
 * {shape, colour, material, lensType, style} per image, using the same
 * controlled vocabulary as src/lib/shifts.ts so IG and product signatures
 * line up.
 *
 * Pulled out of /api/visual-trends so the Shifts pipeline can persist the
 * result back onto brand_content.data.vision and stop re-paying for the
 * same image (the visual-trends route only memoised in-process).
 */

import { GoogleGenAI } from '@google/genai';
import type { FrameAttrs } from '@/lib/shifts';
import { loggerFor } from '@/lib/logger';

const log = loggerFor('vision-attrs');

export interface ImageRef {
  id: string;
  url: string; // direct, fetchable URL (NOT the /api/img proxy)
}

const PROMPT = `You are a senior eyewear merchandising analyst. I'm showing you {N} images, in order (image 0, 1, 2...).

For EACH image, identify the PRIMARY eyewear visible and extract its structured attributes. If no eyewear is visible, return empty strings for that entry.

Return a compact JSON array (no markdown, no code fences):

[
  {"i":0,"shape":"aviator","color":"gold","material":"metal","lensType":"gradient","style":"classic"},
  {"i":1,"shape":"cat-eye","color":"tortoise","material":"acetate","lensType":"dark","style":"retro"}
]

Vocabulary (use these exact lowercase values — pick the closest match):
- shape: aviator | cat-eye | round | square | rectangle | oval | wayfarer | oversized | geometric | rimless | wrap | browline | shield
- color: black | tortoise | gold | silver | clear | brown | red | blue | white | pastel | pink | green | yellow | multicolor
- material: acetate | metal | titanium | mixed | plastic | wood | rimless
- lensType: clear | dark | mirrored | gradient | colored | polarized
- style: classic | retro | minimal | statement | sporty | luxury | streetwear | futuristic

Rules:
- One entry per image in the order shown.
- If the image has no clear eyewear, return {"i":N,"shape":"","color":"","material":"","lensType":"","style":""}.
- Be decisive — pick the single best match from each list.
- Output ONLY the raw JSON array. No preamble.`;

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

function clean(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.toLowerCase().trim() : '';
  return s.length > 0 ? s : undefined;
}

async function loadImage(ref: ImageRef): Promise<{ ref: ImageRef; base64: string; mime: string } | null> {
  try {
    const res = await fetch(ref.url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 4 * 1024 * 1024) return null;
    return {
      ref,
      base64: Buffer.from(buf).toString('base64'),
      mime: res.headers.get('content-type') || 'image/jpeg',
    };
  } catch {
    return null;
  }
}

/**
 * Extract attributes for a batch of images. Returns a map of id → attrs.
 * Images that fail to load or yield no eyewear map to {} (so callers can
 * still cache the "we looked, found nothing" result and skip next time).
 */
export async function extractFrameAttrs(
  apiKey: string,
  images: ImageRef[],
  batchSize = 8,
): Promise<Map<string, FrameAttrs>> {
  const out = new Map<string, FrameAttrs>();
  if (images.length === 0) return out;

  const ai = new GoogleGenAI({ apiKey });
  const loaded = (await Promise.all(images.map(loadImage)))
    .filter((x): x is NonNullable<typeof x> => x !== null);

  for (const img of images) out.set(img.id, {}); // default: looked, found nothing

  for (let start = 0; start < loaded.length; start += batchSize) {
    const slice = loaded.slice(start, start + batchSize);
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: PROMPT.replace('{N}', String(slice.length)) },
      ...slice.map(v => ({ inlineData: { mimeType: v.mime, data: v.base64 } })),
    ];

    let parsed = false;
    for (const model of MODELS) {
      try {
        const r = await ai.models.generateContent({ model, contents: [{ role: 'user', parts }] });
        if (!r.text) continue;
        const txt = r.text.trim()
          .replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
        const arr = JSON.parse(txt) as Array<{ i: number } & FrameAttrs>;
        for (const item of arr) {
          const entry = slice[item.i];
          if (!entry) continue;
          out.set(entry.ref.id, {
            shape: clean(item.shape),
            color: clean(item.color),
            material: clean(item.material),
            lensType: clean(item.lensType),
            style: clean(item.style),
          });
        }
        parsed = true;
        break;
      } catch (err) {
        log.warn({ model, err: err instanceof Error ? err.message : String(err) }, 'vision batch failed');
      }
    }
    if (!parsed) log.warn({ batchStart: start }, 'all vision models failed for batch');
  }

  return out;
}
