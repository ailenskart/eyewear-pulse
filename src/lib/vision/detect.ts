/**
 * Gemini Vision — eyewear detection pipeline.
 *
 * Given an image URL, returns structured data about the eyewear visible
 * on the main subject. Used by:
 *   - Unbranded photo matching (Phase 4 moat)
 *   - Celebrity scans
 *   - Brand post analysis for trend aggregation
 */

import { GoogleGenAI } from '@google/genai';
import { env } from '@/lib/env';

export interface EyewearDetection {
  has_eyewear: boolean;
  confidence: number;           // 0-1 from the model's own self-report
  frame_shape: string | null;   // aviator, cat-eye, round, square, rectangle, oval, wayfarer, oversized, geometric, rimless, wrap, browline, shield
  frame_color: string | null;   // black, tortoise, gold, silver, clear, brown, red, blue, white, pastel, pink, green, yellow, multicolor
  frame_material: string | null; // acetate, metal, titanium, mixed, plastic, wood, rimless
  lens_type: string | null;     // clear, dark, mirrored, gradient, colored, polarized, photochromic
  style: string | null;         // classic, retro, minimal, statement, sporty, luxury, streetwear, futuristic
  description: string;          // human-readable summary
}

/**
 * Run Gemini Vision on a single image URL. Returns structured detection.
 */
export async function detectEyewear(imageUrl: string): Promise<EyewearDetection> {
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY() });

  // Fetch + base64 encode the image
  const imgRes = await fetch(imageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 Lenzy' },
    signal: AbortSignal.timeout(10000),
  });
  if (!imgRes.ok) return emptyDetection();
  const buf = await imgRes.arrayBuffer();
  if (buf.byteLength > 4 * 1024 * 1024) return emptyDetection();
  const base64 = Buffer.from(buf).toString('base64');
  const mime = imgRes.headers.get('content-type') || 'image/jpeg';

  const prompt = `Analyze this photo for eyewear on the main subject. Return JSON only (no markdown, no code fences):

{
  "has_eyewear": true|false,
  "confidence": 0-1,
  "frame_shape": "aviator|cat-eye|round|square|rectangle|oval|wayfarer|oversized|geometric|rimless|wrap|browline|shield" or null,
  "frame_color": "black|tortoise|gold|silver|clear|brown|red|blue|white|pastel|pink|green|yellow|multicolor" or null,
  "frame_material": "acetate|metal|titanium|mixed|plastic|wood|rimless" or null,
  "lens_type": "clear|dark|mirrored|gradient|colored|polarized|photochromic" or null,
  "style": "classic|retro|minimal|statement|sporty|luxury|streetwear|futuristic" or null,
  "description": "Short human-readable summary (max 80 chars) e.g. 'round gold metal aviator sunglasses, gradient lens'"
}

Rules:
- has_eyewear = true ONLY if eyewear is visible ON the main subject's face.
- Eyewear held in hand, pushed up on head, on other people in the shot = false.
- All fields null except has_eyewear=false and description when no eyewear present.
- Return raw JSON. No preamble, no code fences.`;

  for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
    try {
      const r = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [
          { inlineData: { mimeType: mime, data: base64 } },
          { text: prompt },
        ]}],
      });
      if (!r.text) continue;
      const txt = r.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(txt) as EyewearDetection;
      return {
        has_eyewear: !!parsed.has_eyewear,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        frame_shape: parsed.frame_shape || null,
        frame_color: parsed.frame_color || null,
        frame_material: parsed.frame_material || null,
        lens_type: parsed.lens_type || null,
        style: parsed.style || null,
        description: parsed.description || '',
      };
    } catch { continue; }
  }
  return emptyDetection();
}

function emptyDetection(): EyewearDetection {
  return {
    has_eyewear: false,
    confidence: 0,
    frame_shape: null,
    frame_color: null,
    frame_material: null,
    lens_type: null,
    style: null,
    description: '',
  };
}

/**
 * Build a descriptive string suitable for text embedding.
 * Example: "round gold metal aviator sunglasses, gradient lens"
 */
export function eyewearDescription(d: EyewearDetection): string {
  if (!d.has_eyewear) return '';
  const parts = [d.frame_shape, d.frame_color, d.frame_material, d.lens_type, d.style].filter(Boolean);
  return parts.join(' · ') || d.description;
}
