/**
 * v1 brands endpoint — Zod-validated read surface over tracked_brands.
 *
 *   GET /api/v1/brands?search=...&category=...&region=...&tier=...&page=1&limit=100
 *
 * Returns active brands with content counts aggregated from brand_content.
 * Use /api/v1/brands/profile?id=... for the full per-brand deep-dive payload.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase';
import { ok, withHandler, validateQuery } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const querySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  tier: z.enum(['fast', 'mid', 'full']).optional(),
  active: z.coerce.boolean().optional().default(true),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
});

export const GET = withHandler('v1.brands', async (request: NextRequest) => {
  const v = validateQuery(request, querySchema);
  if (!v.ok) return v.response;
  const { search, category, region, country, tier, active, page, limit } = v.data;

  const client = supabaseServer();
  let q = client.from('tracked_brands').select('*', { count: 'exact' });
  if (active) q = q.eq('active', true);
  if (category && category !== 'All') q = q.eq('category', category);
  if (region && region !== 'All') q = q.eq('region', region);
  if (country) q = q.eq('country', country);
  if (tier) q = q.eq('tier', tier);
  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`handle.ilike.${s},name.ilike.${s},parent_company.ilike.${s}`);
  }
  q = q.order('instagram_followers', { ascending: false, nullsFirst: false })
       .range((page - 1) * limit, page * limit - 1);

  const { data, count, error } = await q;
  if (error) return ok({ error: error.message }, { status: 500 });

  const rows = (data || []) as Array<{ id: number; [key: string]: unknown }>;
  const brandIds = rows.map(r => r.id).filter(Boolean);

  const countsByBrand = new Map<number, Record<string, number>>();
  if (brandIds.length > 0) {
    const { data: contentRows } = await client
      .from('brand_content')
      .select('brand_id,type')
      .in('brand_id', brandIds)
      .eq('is_active', true);
    for (const r of (contentRows || []) as Array<{ brand_id: number; type: string }>) {
      if (!countsByBrand.has(r.brand_id)) countsByBrand.set(r.brand_id, {});
      const m = countsByBrand.get(r.brand_id)!;
      m[r.type] = (m[r.type] || 0) + 1;
    }
  }

  const enriched = rows.map(r => {
    const counts = countsByBrand.get(r.id) || {};
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return { ...r, content_counts: counts, total_content: total };
  });

  return ok({
    brands: enriched,
    total: count || 0,
    page,
    totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
  });
});
