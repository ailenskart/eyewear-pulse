import { NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase';
import { detectEyewear, eyewearDescription } from '@/lib/vision/detect';
import { embedTexts } from '@/lib/embeddings/openai';
import { ok, fail, withHandler, validateBody } from '@/lib/api';

/**
 * Attribute an unbranded eyewear photo to a brand.
 *
 *   POST /api/v1/attribute
 *   body: { image_url: "https://...", persist?: boolean }
 *
 * Pipeline:
 *   1. Gemini Vision → { shape, color, material, lens, style }
 *   2. Build descriptive text
 *   3. OpenAI text-embedding-3-small → 1536-dim vector
 *   4. pgvector nearest-neighbour search on product_embeddings
 *   5. Return top-5 matches with confidence score (= top-1 similarity)
 *
 * If persist=true and top-1 similarity >= 0.75, write a brand_content row
 * type='celeb_photo' with the attributed brand_id.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const bodySchema = z.object({
  image_url: z.string().url(),
  person_name: z.string().optional(),
  source: z.string().optional().default('attribute'),
  persist: z.boolean().optional().default(false),
});

export const POST = withHandler('v1.attribute', async (request: NextRequest) => {
  const v = await validateBody(request, bodySchema);
  if (!v.ok) return v.response;
  const { image_url, person_name, source, persist } = v.data;

  // 1. Vision detection
  const detection = await detectEyewear(image_url);
  if (!detection.has_eyewear) {
    return ok({
      image_url,
      detection,
      matches: [],
      note: 'No eyewear detected on main subject.',
    });
  }

  // 2 + 3. Build text + embed
  const text = eyewearDescription(detection);
  if (!text || !process.env.OPENAI_API_KEY) {
    return ok({
      image_url,
      detection,
      matches: [],
      note: 'No embeddings available (OPENAI_API_KEY not set or no text).',
    });
  }

  const [queryVec] = await embedTexts([text]);
  if (!queryVec) return fail('Embedding failed', 502);

  // 4. pgvector nearest-neighbour search
  const client = supabaseServer();
  const { data: neighbours, error } = await client.rpc('product_similarity_search', {
    query_embedding: queryVec,
    match_count: 5,
  });
  if (error) return fail(`Similarity search failed: ${error.message}`, 502);

  const matches = (neighbours || []) as Array<{ brand_content_id: number; brand_id: number; brand_handle: string; title: string; image_url: string; price: number | null; currency: string | null; similarity: number }>;
  const top1 = matches[0];
  const attributed = top1 && top1.similarity >= 0.75;

  // 5. Persist if requested and confident
  if (persist && attributed) {
    await client.from('brand_content').insert({
      brand_id: top1.brand_id,
      brand_handle: top1.brand_handle,
      type: 'celeb_photo',
      source,
      source_ref: null,
      image_url,
      caption: person_name ? `${person_name} wearing ${text}` : `Spotted: ${text}`,
      eyewear_type: text,
      person_name: person_name || null,
      data: {
        attribution_confidence: top1.similarity,
        vision: detection,
        top_matches: matches.slice(0, 3).map(m => ({ brand_id: m.brand_id, similarity: m.similarity, title: m.title })),
      },
    });
  }

  return ok({
    image_url,
    detection,
    query_text: text,
    matches,
    confidence: top1?.similarity || 0,
    attributed,
    persisted: persist && attributed,
  });
});
