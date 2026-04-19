import { NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase';
import { ok, withHandler, validateQuery } from '@/lib/api';

/**
 * Unified cross-entity search. Powers the Command Palette (⌘K).
 *
 *   GET /api/v1/search?q=rayban&limit=10
 *
 * Returns: { brands, people, products, celebrities }
 * Everything text-matched via pg_trgm similarity for speed.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const querySchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(30).optional().default(10),
});

export const GET = withHandler('v1.search', async (request: NextRequest) => {
  const v = validateQuery(request, querySchema);
  if (!v.ok) return v.response;
  const { q, limit } = v.data;

  const client = supabaseServer();
  const pattern = `%${q.trim()}%`;

  const [brands, people, products, celebs] = await Promise.all([
    client.from('tracked_brands')
      .select('id, handle, name, category, country, instagram_url, logo_url')
      .or(`name.ilike.${pattern},handle.ilike.${pattern}`)
      .eq('active', true)
      .order('instagram_followers', { ascending: false, nullsFirst: false })
      .limit(limit),

    client.from('directory_people')
      .select('id, name, title, company_current, linkedin_url, brand_ids, photo_url')
      .ilike('name', pattern)
      .limit(limit),

    client.from('brand_content')
      .select('id, title, brand_handle, brand_id, price, currency, image_url, blob_url, type')
      .eq('type', 'product')
      .ilike('title', pattern)
      .limit(limit),

    client.from('brand_content')
      .select('id, person_name, eyewear_type, brand_id, brand_handle, image_url, type')
      .eq('type', 'celeb_photo')
      .ilike('person_name', pattern)
      .limit(limit),
  ]);

  return ok({
    q,
    brands: brands.data || [],
    people: people.data || [],
    products: products.data || [],
    celebrities: celebs.data || [],
    counts: {
      brands: brands.data?.length || 0,
      people: people.data?.length || 0,
      products: products.data?.length || 0,
      celebrities: celebs.data?.length || 0,
    },
  });
});
