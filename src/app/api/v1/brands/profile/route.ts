import { NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase';
import { ok, fail, withHandler, validateQuery } from '@/lib/api';

/**
 * Per-brand deep-dive profile endpoint. Powers /brands/[id] pages.
 *
 *   GET /api/v1/brands/profile?id=37
 *   GET /api/v1/brands/profile?handle=warbyparker
 *
 * Returns: brand + per-type content counts + top content per type
 * + people linked + latest posts + competitors (same category+region)
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const querySchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  handle: z.string().min(1).max(100).optional(),
}).refine(v => v.id || v.handle, { message: 'id or handle required' });

export const GET = withHandler('v1.brands.profile', async (request: NextRequest) => {
  const v = validateQuery(request, querySchema);
  if (!v.ok) return v.response;
  const { id, handle } = v.data;

  const client = supabaseServer();

  // 1. Fetch brand
  let brandQuery = client.from('tracked_brands').select('*');
  if (id) brandQuery = brandQuery.eq('id', id);
  else if (handle) brandQuery = brandQuery.eq('handle', handle.toLowerCase());
  const { data: brand } = await brandQuery.maybeSingle();
  if (!brand) return fail('Brand not found', 404);
  const brandId = (brand as { id: number }).id;

  // 2. Content breakdown (counts by type) + recent items per type
  const [contentCounts, recentPosts, recentProducts, people, recentCelebs, reimagines, competitors] = await Promise.all([
    client.from('brand_content').select('type').eq('brand_id', brandId).eq('is_active', true),
    client.from('brand_content')
      .select('id, caption, image_url, blob_url, likes, comments, engagement, post_type, posted_at, url')
      .eq('brand_id', brandId).eq('type', 'ig_post').eq('is_active', true)
      .order('posted_at', { ascending: false, nullsFirst: false }).limit(12),
    client.from('brand_content')
      .select('id, title, image_url, blob_url, price, compare_price, currency, product_type, url, posted_at')
      .eq('brand_id', brandId).eq('type', 'product').eq('is_active', true)
      .order('posted_at', { ascending: false, nullsFirst: false }).limit(20),
    client.from('directory_people')
      .select('id, name, title, department, seniority, linkedin_url, photo_url, location')
      .contains('brand_ids', [brandId]).limit(20),
    client.from('brand_content')
      .select('id, person_name, eyewear_type, image_url, blob_url, url, detected_at')
      .eq('brand_id', brandId).eq('type', 'celeb_photo').eq('is_active', true)
      .order('detected_at', { ascending: false }).limit(12),
    client.from('brand_content')
      .select('id, title, image_url, blob_url, parent_id, data, created_at')
      .eq('brand_id', brandId).eq('type', 'reimagine')
      .order('created_at', { ascending: false }).limit(12),
    // Competitors = same category + region, excluding self
    client.from('tracked_brands')
      .select('id, handle, name, logo_url, instagram_followers, category, region')
      .eq('category', (brand as { category: string }).category)
      .eq('region', (brand as { region: string }).region)
      .neq('id', brandId)
      .eq('active', true)
      .order('instagram_followers', { ascending: false, nullsFirst: false })
      .limit(6),
  ]);

  const countsByType: Record<string, number> = {};
  for (const r of (contentCounts.data || []) as Array<{ type: string }>) {
    countsByType[r.type] = (countsByType[r.type] || 0) + 1;
  }
  const totalContent = Object.values(countsByType).reduce((s, n) => s + n, 0);

  return ok({
    brand,
    counts: {
      total_content: totalContent,
      by_type: countsByType,
      posts: countsByType.ig_post || 0,
      products: countsByType.product || 0,
      people: people.data?.length || 0,
      celeb_photos: countsByType.celeb_photo || 0,
      reimagines: countsByType.reimagine || 0,
      website_links: countsByType.website_link || 0,
    },
    posts: recentPosts.data || [],
    products: recentProducts.data || [],
    people: people.data || [],
    celebs: recentCelebs.data || [],
    reimagines: reimagines.data || [],
    competitors: competitors.data || [],
    generated_at: new Date().toISOString(),
  });
});
