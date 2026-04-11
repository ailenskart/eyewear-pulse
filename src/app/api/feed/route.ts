import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { toFeedPost, getLastCronRun, type IgPostDbRow, type Post } from '@/lib/feed-db';
// Legacy JSON fallback — only used if Supabase is empty (fresh deploys before seeding).
import { ALL_POSTS as JSON_POSTS, FEED_STATS as JSON_STATS } from '@/lib/feed';

/**
 * Feed API — Supabase-backed.
 *
 * Reads `ig_posts` with server-side filtering (category, region,
 * brand, text search) + sort + pagination. Stats are computed on
 * the fly from the same filtered window.
 *
 * Falls back to the legacy bundled JSON if the Supabase table is
 * empty — that way a fresh deploy still renders before the seed
 * endpoint has been hit.
 *
 * A "lastUpdated" object is tacked onto every response so the UI
 * can show "Updated 4 min ago" and a refresh button.
 */

export const maxDuration = 30;

interface FeedStats {
  totalPosts: number;
  totalBrands: number;
  avgEngagement: number;
  topHashtags: Array<{ name: string; count: number }>;
  contentMix: Array<{ name: string; count: number }>;
  byCategory: Array<{ name: string; count: number }>;
  byRegion: Array<{ name: string; count: number }>;
}

interface FeedResponse {
  posts: Post[];
  total: number;
  page: number;
  totalPages: number;
  stats: FeedStats;
  source: 'supabase' | 'json-fallback';
  lastUpdated: { tier: string; ran_at: string; new_posts: number } | null;
}

// Tiny in-memory stats cache keyed by filter combo so repeated polls
// from the UI don't re-aggregate 2k+ rows.
const STATS_CACHE = new Map<string, { stats: FeedStats; expiresAt: number }>();
const STATS_TTL_MS = 2 * 60 * 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const category = searchParams.get('category');
  const region = searchParams.get('region');
  const brand = searchParams.get('brand');
  const search = searchParams.get('search');
  const sortBy = searchParams.get('sortBy') || 'recent';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '40')));

  const client = supabaseServer();

  // Build the filtered query.
  const buildQuery = () => {
    let q = client.from('ig_posts').select('*', { count: 'exact' });
    if (category && category !== 'All') q = q.eq('brand_category', category);
    if (region && region !== 'All') q = q.eq('brand_region', region);
    if (brand) q = q.eq('brand_handle', brand);
    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      // Match caption OR brand name OR brand handle
      q = q.or(`caption.ilike.${s},brand_name.ilike.${s},brand_handle.ilike.${s}`);
    }
    return q;
  };

  // Sort + paginate
  let q = buildQuery();
  switch (sortBy) {
    case 'likes':
      q = q.order('likes', { ascending: false, nullsFirst: false });
      break;
    case 'engagement':
      q = q.order('engagement', { ascending: false, nullsFirst: false });
      break;
    case 'comments':
      q = q.order('comments', { ascending: false, nullsFirst: false });
      break;
    case 'recent':
    default:
      // D2C first is hard to express in SQL without a computed column.
      // For now, just order by posted_at. If callers really want D2C
      // first they can pass category=D2C.
      q = q.order('posted_at', { ascending: false, nullsFirst: false }).order('likes', { ascending: false });
      break;
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  q = q.range(from, to);

  const { data, error, count } = await q;

  if (error) {
    // Log and fall back to JSON below
    console.error('feed query error:', error.message);
  }

  const rows = (data as IgPostDbRow[] | null) || [];

  // Fallback to JSON if table is empty.
  if (!error && count === 0) {
    const fallback = buildJsonFallback({ category, region, brand, search, sortBy, page, limit });
    return NextResponse.json(fallback);
  }

  // Compute stats (cached 2 min per filter combo).
  const cacheKey = `stats:${category || ''}:${region || ''}:${brand || ''}:${search || ''}`;
  let stats: FeedStats;
  const cached = STATS_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    stats = cached.stats;
  } else {
    stats = await computeStats(client, { category, region, brand, search });
    STATS_CACHE.set(cacheKey, { stats, expiresAt: Date.now() + STATS_TTL_MS });
  }

  const lastUpdated = await getLastCronRun().catch(() => null);

  const payload: FeedResponse = {
    posts: rows.map(toFeedPost),
    total: count || rows.length,
    page,
    totalPages: Math.max(1, Math.ceil((count || rows.length) / limit)),
    stats,
    source: 'supabase',
    lastUpdated,
  };
  return NextResponse.json(payload);
}

/* ─── Stats computation ─── */

async function computeStats(
  client: ReturnType<typeof supabaseServer>,
  filters: { category?: string | null; region?: string | null; brand?: string | null; search?: string | null },
): Promise<FeedStats> {
  // We pull a limited window for aggregation (top 2k most recent) so this
  // stays fast even as the table grows. Anything more expensive should be
  // a materialized view.
  let q = client
    .from('ig_posts')
    .select('brand_handle,brand_category,brand_region,post_type,hashtags,engagement')
    .order('posted_at', { ascending: false, nullsFirst: false })
    .limit(2000);

  if (filters.category && filters.category !== 'All') q = q.eq('brand_category', filters.category);
  if (filters.region && filters.region !== 'All') q = q.eq('brand_region', filters.region);
  if (filters.brand) q = q.eq('brand_handle', filters.brand);
  if (filters.search && filters.search.trim()) {
    const s = `%${filters.search.trim()}%`;
    q = q.or(`caption.ilike.${s},brand_name.ilike.${s},brand_handle.ilike.${s}`);
  }

  const { data } = await q;
  const rows = data || [];

  const brands = new Set<string>();
  const tagMap = new Map<string, number>();
  const typeMap = new Map<string, number>();
  const catMap = new Map<string, number>();
  const regMap = new Map<string, number>();
  let totalEng = 0;

  for (const r of rows as Array<{ brand_handle: string; brand_category: string | null; brand_region: string | null; post_type: string | null; hashtags: string[] | null; engagement: number | null }>) {
    brands.add(r.brand_handle);
    for (const t of r.hashtags || []) tagMap.set(t, (tagMap.get(t) || 0) + 1);
    const type = r.post_type || 'Image';
    typeMap.set(type, (typeMap.get(type) || 0) + 1);
    if (r.brand_category) catMap.set(r.brand_category, (catMap.get(r.brand_category) || 0) + 1);
    if (r.brand_region) regMap.set(r.brand_region, (regMap.get(r.brand_region) || 0) + 1);
    totalEng += Number(r.engagement) || 0;
  }

  const toSorted = (m: Map<string, number>, topN?: number) => {
    const arr = [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
    return topN ? arr.slice(0, topN) : arr;
  };

  return {
    totalPosts: rows.length,
    totalBrands: brands.size,
    avgEngagement: rows.length > 0 ? parseFloat((totalEng / rows.length).toFixed(2)) : 0,
    topHashtags: toSorted(tagMap, 20),
    contentMix: toSorted(typeMap),
    byCategory: toSorted(catMap),
    byRegion: toSorted(regMap),
  };
}

/* ─── JSON fallback (fresh deploys before seed) ─── */

function buildJsonFallback(opts: {
  category: string | null;
  region: string | null;
  brand: string | null;
  search: string | null;
  sortBy: string;
  page: number;
  limit: number;
}): FeedResponse {
  let filtered = [...JSON_POSTS];
  if (opts.category && opts.category !== 'All') filtered = filtered.filter(p => p.brand.category === opts.category);
  if (opts.region && opts.region !== 'All') filtered = filtered.filter(p => p.brand.region === opts.region);
  if (opts.brand) filtered = filtered.filter(p => p.brand.handle === opts.brand);
  if (opts.search) {
    const s = opts.search.toLowerCase();
    filtered = filtered.filter(p =>
      p.brand.name.toLowerCase().includes(s) ||
      p.brand.handle.toLowerCase().includes(s) ||
      p.caption.toLowerCase().includes(s) ||
      p.hashtags.some(h => h.toLowerCase().includes(s))
    );
  }
  const d2cBoost = (p: typeof filtered[0]) => p.brand.category === 'D2C' ? 1 : 0;
  switch (opts.sortBy) {
    case 'likes': filtered.sort((a, b) => b.likes - a.likes); break;
    case 'engagement': filtered.sort((a, b) => b.engagement - a.engagement); break;
    case 'comments': filtered.sort((a, b) => b.comments - a.comments); break;
    default:
      filtered.sort((a, b) => {
        const d = d2cBoost(b) - d2cBoost(a);
        if (d !== 0) return d;
        const tdiff = new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime();
        if (tdiff !== 0) return tdiff;
        return b.likes - a.likes;
      });
  }
  const total = filtered.length;
  const start = (opts.page - 1) * opts.limit;
  return {
    posts: filtered.slice(start, start + opts.limit),
    total,
    page: opts.page,
    totalPages: Math.max(1, Math.ceil(total / opts.limit)),
    stats: JSON_STATS,
    source: 'json-fallback',
    lastUpdated: null,
  };
}
