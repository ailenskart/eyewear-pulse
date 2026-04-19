/**
 * Review queue — unattributed or low-confidence eyewear matches that need
 * human review. Feeds /admin/review.
 *
 *   GET  /api/v1/review-queue?min=0.5&max=0.75&page=1
 *   POST /api/v1/review-queue       { content_id, action: 'approve'|'reject', brand_id?: number }
 *
 * Reads brand_content rows where data->>'attribution_confidence' is in range.
 * On 'approve', sets brand_id (if provided) and clears review flag via is_active=true.
 * On 'reject', sets is_active=false.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase';
import { ok, fail, withHandler, validateBody, validateQuery } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const listQuerySchema = z.object({
  min: z.coerce.number().min(0).max(1).optional().default(0.5),
  max: z.coerce.number().min(0).max(1).optional().default(0.75),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export const GET = withHandler('v1.reviewQueue.get', async (request: NextRequest) => {
  const v = validateQuery(request, listQuerySchema);
  if (!v.ok) return v.response;
  const { min, max, page, limit } = v.data;

  const client = supabaseServer();
  const { data, error, count } = await client
    .from('brand_content')
    .select('id,brand_id,brand_handle,type,image_url,caption,person_name,data,detected_at', { count: 'exact' })
    .eq('type', 'celeb_photo')
    .gte('data->>attribution_confidence', String(min))
    .lte('data->>attribution_confidence', String(max))
    .order('detected_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (error) return fail(error.message, 500);

  return ok({
    items: data || [],
    total: count || 0,
    page,
    totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
  });
});

const mutateSchema = z.object({
  content_id: z.number().int().positive(),
  action: z.enum(['approve', 'reject']),
  brand_id: z.number().int().positive().optional(),
  brand_handle: z.string().optional(),
});

export const POST = withHandler('v1.reviewQueue.post', async (request: NextRequest) => {
  const v = await validateBody(request, mutateSchema);
  if (!v.ok) return v.response;
  const { content_id, action, brand_id, brand_handle } = v.data;

  const client = supabaseServer();
  if (action === 'reject') {
    const { error } = await client
      .from('brand_content')
      .update({ is_active: false })
      .eq('id', content_id);
    if (error) return fail(error.message, 500);
    return ok({ success: true, action: 'rejected' });
  }

  const patch: Record<string, unknown> = { is_active: true };
  if (brand_id) patch.brand_id = brand_id;
  if (brand_handle) patch.brand_handle = brand_handle.toLowerCase();

  const { error } = await client
    .from('brand_content')
    .update(patch)
    .eq('id', content_id);
  if (error) return fail(error.message, 500);
  return ok({ success: true, action: 'approved' });
});
