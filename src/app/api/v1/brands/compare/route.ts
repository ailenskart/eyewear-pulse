import { NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase';
import { ok, withHandler, validateQuery } from '@/lib/api';

/**
 * Side-by-side comparison endpoint.
 *
 *   GET /api/v1/brands/compare?ids=37,142,343
 *
 * Returns: [{ brand, counts, posting_velocity, avg_engagement }] for each ID
 * Same shape as brands/profile but trimmed to what fits a comparison table.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const querySchema = z.object({
  ids: z.string().min(1).transform(s => s.split(',').map(x => parseInt(x.trim())).filter(n => Number.isFinite(n))),
});

export const GET = withHandler('v1.brands.compare', async (request: NextRequest) => {
  const v = validateQuery(request, querySchema);
  if (!v.ok) return v.response;
  const { ids } = v.data;

  const client = supabaseServer();

  const [brandsRes, contentRes] = await Promise.all([
    client.from('tracked_brands')
      .select('id,handle,name,logo_url,category,region,country,business_type,price_range,parent_company,ownership_type,is_public,stock_ticker,employee_count,store_count,revenue_estimate,instagram_followers,founded_year,website,instagram_url')
      .in('id', ids),
    client.from('brand_content')
      .select('brand_id,type,likes,comments,posted_at')
      .in('brand_id', ids)
      .eq('is_active', true)
      .limit(50000),
  ]);

  // Aggregate per brand
  const agg = new Map<number, { type_counts: Record<string, number>; total_likes: number; total_comments: number; total_posts: number; posts_last_30d: number }>();
  const cutoff30d = Date.now() - 30 * 86400 * 1000;
  for (const r of (contentRes.data || []) as Array<{ brand_id: number; type: string; likes: number; comments: number; posted_at: string | null }>) {
    if (!agg.has(r.brand_id)) agg.set(r.brand_id, { type_counts: {}, total_likes: 0, total_comments: 0, total_posts: 0, posts_last_30d: 0 });
    const a = agg.get(r.brand_id)!;
    a.type_counts[r.type] = (a.type_counts[r.type] || 0) + 1;
    if (r.type === 'ig_post') {
      a.total_posts++;
      a.total_likes += r.likes || 0;
      a.total_comments += r.comments || 0;
      if (r.posted_at && new Date(r.posted_at).getTime() > cutoff30d) a.posts_last_30d++;
    }
  }

  const items = ((brandsRes.data || []) as Array<Record<string, unknown>>).map(b => {
    const a = agg.get(b.id as number) || { type_counts: {}, total_likes: 0, total_comments: 0, total_posts: 0, posts_last_30d: 0 };
    return {
      brand: b,
      counts: {
        total_content: Object.values(a.type_counts).reduce((s, n) => s + n, 0),
        by_type: a.type_counts,
      },
      engagement: {
        total_posts: a.total_posts,
        total_likes: a.total_likes,
        avg_likes_per_post: a.total_posts ? Math.round(a.total_likes / a.total_posts) : 0,
        total_comments: a.total_comments,
        posts_last_30d: a.posts_last_30d,
      },
    };
  });

  return ok({ items, generated_at: new Date().toISOString() });
});
