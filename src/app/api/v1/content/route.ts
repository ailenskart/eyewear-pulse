/**
 * v1 content endpoint — proxies /api/content with Zod validation.
 * The existing /api/content already has the full implementation; we just
 * wrap it for the v1 contract.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase';
import { ok, cached, withHandler, validateQuery } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const querySchema = z.object({
  brand_id: z.coerce.number().int().positive().optional(),
  brand_handle: z.string().optional(),
  type: z.string().optional(),
  parent_id: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export const GET = withHandler('v1.content', async (request: NextRequest) => {
  const v = validateQuery(request, querySchema);
  if (!v.ok) return v.response;
  const { brand_id, brand_handle, type, parent_id, search, page, limit } = v.data;

  const client = supabaseServer();
  let q = client.from('brand_content').select('*', { count: 'exact' }).eq('is_active', true);
  if (brand_id) q = q.eq('brand_id', brand_id);
  if (brand_handle) q = q.eq('brand_handle', brand_handle.toLowerCase());
  if (type) q = q.eq('type', type);
  if (parent_id) q = q.eq('parent_id', parent_id);
  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`title.ilike.${s},caption.ilike.${s},description.ilike.${s},person_name.ilike.${s}`);
  }
  q = q.order('posted_at', { ascending: false, nullsFirst: false }).order('detected_at', { ascending: false });
  q = q.range((page - 1) * limit, page * limit - 1);

  const { data, count, error } = await q;
  if (error) return ok({ error: error.message }, { status: 500 });

  return cached({
    content: data || [],
    total: count || 0,
    page,
    totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
  }, 60);
});
