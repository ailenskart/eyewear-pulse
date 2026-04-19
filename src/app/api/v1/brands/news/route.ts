import { NextRequest } from 'next/server';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { supabaseServer } from '@/lib/supabase';
import { env } from '@/lib/env';
import { ok, fail, withHandler, validateQuery } from '@/lib/api';

/**
 * Gemini-generated brand news brief. One-paragraph summary per section:
 *   What they're doing · What they're launching · Who's joined · What others say · Lenskart take
 *
 * Cached 7 days per brand. Re-generate with ?refresh=1 (Editor+).
 *
 *   GET /api/v1/brands/news?id=37
 *   GET /api/v1/brands/news?id=37&refresh=1
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const querySchema = z.object({
  id: z.coerce.number().int().positive(),
  refresh: z.coerce.boolean().optional().default(false),
});

// In-memory cache (7 days TTL). For production, move to Supabase brand_content cache row.
const CACHE = new Map<number, { payload: unknown; expiresAt: number }>();
const TTL_MS = 7 * 86400 * 1000;

export const GET = withHandler('v1.brands.news', async (request: NextRequest) => {
  const v = validateQuery(request, querySchema);
  if (!v.ok) return v.response;
  const { id, refresh } = v.data;

  if (!refresh) {
    const cached = CACHE.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      return ok({ ...(cached.payload as Record<string, unknown>), cached: true });
    }
  }

  const client = supabaseServer();
  const { data: brand } = await client
    .from('tracked_brands')
    .select('id,name,handle,description,category,country,parent_company,website,ceo_name,founded_year,business_type,is_public,stock_ticker')
    .eq('id', id).maybeSingle();
  if (!brand) return fail('Brand not found', 404);

  // Pull recent context (last 30 days of posts + latest products + recent people)
  const [posts, products, people] = await Promise.all([
    client.from('brand_content').select('caption,likes,posted_at').eq('brand_id', id).eq('type', 'ig_post').order('posted_at', { ascending: false, nullsFirst: false }).limit(10),
    client.from('brand_content').select('title,price,currency,posted_at').eq('brand_id', id).eq('type', 'product').order('posted_at', { ascending: false, nullsFirst: false }).limit(10),
    client.from('directory_people').select('name,title,added_at').contains('brand_ids', [id]).order('added_at', { ascending: false }).limit(5),
  ]);

  const GEMINI_KEY = env.GEMINI_API_KEY();
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

  const prompt = `You are Lenzy's brand analyst writing a 5-section brief for Lenskart's team. Be concrete, cite numbers from the data. No marketing fluff.

═══ BRAND ═══
${JSON.stringify(brand, null, 2)}

═══ RECENT POSTS (last 10) ═══
${(posts.data || []).map((p, i) => `${i + 1}. ${p.likes || 0} likes · "${(p.caption || '').slice(0, 120)}"`).join('\n')}

═══ RECENT PRODUCTS (last 10) ═══
${(products.data || []).map((p, i) => `${i + 1}. ${p.title}${p.price ? ' · $' + p.price : ''}`).join('\n')}

═══ RECENT PEOPLE ═══
${(people.data || []).map(p => `- ${p.name}: ${p.title || ''}`).join('\n') || 'No recent people'}

═══ OUTPUT ═══
Return ONLY valid JSON matching this shape (no markdown, no code fences):
{
  "what_theyre_doing": "2-3 sentences. What's the creative POV, what angle are they pushing right now? Cite specific recent post language or themes.",
  "what_theyre_launching": "2-3 sentences. What products/categories are they releasing? Any price trends?",
  "whos_joined": "1-2 sentences. Any recent hires worth noting? Who are the key people right now?",
  "what_others_say": "1-2 sentences. If there's any press / reception signal from engagement numbers, surface it.",
  "lenskart_take": "2-3 sentences. Strategic implications for Lenskart. What should we copy, what should we avoid, where's the opportunity?"
}`;

  for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
    try {
      const r = await ai.models.generateContent({ model, contents: prompt });
      if (!r.text) continue;
      const txt = r.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(txt);
      const payload = {
        brand_id: id,
        brand_name: (brand as { name: string }).name,
        model,
        generated_at: new Date().toISOString(),
        sections: parsed,
        cached: false,
      };
      CACHE.set(id, { payload, expiresAt: Date.now() + TTL_MS });
      return ok(payload);
    } catch { continue; }
  }

  return fail('Gemini synthesis failed. Try again.', 502);
});
