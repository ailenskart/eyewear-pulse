import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { toFeedPost, getLastCronRun, type IgPostDbRow, type Post } from '@/lib/feed-db';
// Legacy JSON fallback — only used if Supabase is empty (fresh deploys before seeding).
import { ALL_POSTS as JSON_POSTS, FEED_STATS as JSON_STATS } from '@/lib/feed';

/**
 * Feed API — Supabase-backed.
 *
 * Reads `brand_content` (type='ig_post') with server-side filtering
 * (category, region, brand, text search) + sort + pagination.
 *
 * The `brand_content` table is the unified polymorphic table that
 * replaced the legacy `ig_posts` table after the Phase 1 rebuild.
 * The `data` JSONB column stores brand_category, brand_region,
 * brand_name, post_type, is_video, carousel_slides, etc.
 *
 * Falls back to the legacy bundled JSON if the Supabase table is
 * empty — that way a fresh deploy still renders before the seed
 * endpoint has been hit.
 */

export const maxDuration = 30;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

const STATS_CACHE = new Map<string, { stats: FeedStats; expiresAt: number }>();
const STATS_TTL_MS = 2 * 60 * 1000;

/* ─── Randomisation + brand-spread helpers ─── */

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function spreadByBrand<T extends { brand: { handle: string } }>(posts: T[]): T[] {
  const byBrand = new Map<string, T[]>();
  for (const p of posts) {
    const k = p.brand.handle;
    if (!byBrand.has(k)) byBrand.set(k, []);
    byBrand.get(k)!.push(p);
  }
  const brandOrder = shuffle([...byBrand.keys()]);
  const queues = brandOrder.map(k => shuffle(byBrand.get(k)!));
  const out: T[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const q of queues) {
      const next = q.shift();
      if (next) {
        out.push(next);
        added = true;
      }
    }
  }
  return out;
}

/**
 * Convert a brand_content row into the IgPostDbRow shape that
 * toFeedPost() expects. The brand_content table stores brand
 * metadata in the `data` JSONB column.
 */
function contentRowToIgPostRow(r: Record<string, unknown>): IgPostDbRow {
  const data = (r.data || {}) as Record<string, unknown>;
  return {
    id: String(r.source_ref || r.id || ''),
    brand_handle: String(r.brand_handle || ''),
    brand_name: String(data.brand_name || r.brand_handle || ''),
    brand_category: String(data.brand_category || 'Independent'),
    brand_region: String(data.brand_region || 'Global'),
    brand_price_range: String(data.brand_price_range || '$$'),
    caption: String(r.caption || ''),
    likes: Number(r.likes) || 0,
    comments: Number(r.comments) || 0,
    engagement: Number(r.engagement) || 0,
    post_type: String(data.post_type || 'Image'),
    post_url: String(r.url || ''),
    image_url: String(r.image_url || ''),
    blob_url: r.blob_url ? String(r.blob_url) : null,
    video_url: r.video_url ? String(r.video_url) : null,
    video_blob_url: data.video_blob_url ? String(data.video_blob_url) : null,
    is_video: Boolean(data.is_video),
    hashtags: (r.hashtags || []) as string[],
    mentions: (data.mentions || []) as string[],
    carousel_slides: ((data.carousel_slides || []) as Array<{ url: string; type: string }>),
    posted_at: r.posted_at ? String(r.posted_at) : null,
  };
}

function freshnessScore(r: IgPostDbRow): number {
  const posted = r.posted_at ? new Date(r.posted_at).getTime() : 0;
  const hoursOld = posted > 0 ? (Date.now() - posted) / 3600000 : 10000;
  const recency = Math.exp(-hoursOld / (24 * 14));
  const engagement = Math.log1p((Number(r.likes) || 0) + (Number(r.comments) || 0) * 5);
  const jitter = 0.85 + Math.random() * 0.3;
  return (recency * 3 + engagement * 0.3) * jitter;
}

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

  // Build the filtered query against brand_content (type='ig_post').
  // Category and region are stored in the `data` JSONB column.
  const buildQuery = () => {
    let q = client.from('brand_content').select('*', { count: 'exact' })
      .eq('type', 'ig_post');
    if (category && category !== 'All') q = q.eq('data->>brand_category', category);
    if (region && region !== 'All') q = q.eq('data->>brand_region', region);
    if (brand) q = q.eq('brand_handle', brand);
    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      q = q.or(`caption.ilike.${s},brand_handle.ilike.${s}`);
    }
    return q;
  };

  if (sortBy === 'recent') {
    const poolSize = Math.max(300, page * limit * 3);
    const q = buildQuery()
      .order('posted_at', { ascending: false, nullsFirst: false })
      .range(0, poolSize - 1);
    const { data, error, count } = await q;
    if (error) {
      console.error('feed query error:', error.message);
    }
    const rawRows = (data as Record<string, unknown>[] | null) || [];
    if (!error && count === 0) {
      return NextResponse.json(buildJsonFallback({ category, region, brand, search, sortBy, page, limit }));
    }
    const rows = rawRows.map(contentRowToIgPostRow);
    const scored = rows
      .map(r => ({ r, s: freshnessScore(r) }))
      .sort((a, b) => b.s - a.s)
      .map(x => x.r);
    const mapped = scored.map(toFeedPost);
    const spread = spreadByBrand(mapped);
    const start = (page - 1) * limit;
    const paged = spread.slice(start, start + limit);

    const stats = await getStatsCached(client, { category, region, brand, search });
    const lastUpdated = await getLastCronRun().catch(() => null);
    const total = count || rows.length;
    return NextResponse.json({
      posts: paged,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      stats,
      source: 'supabase',
      lastUpdated,
    });
  }

  // Deterministic sorts (likes / engagement / comments / shuffle)
  if (sortBy === 'shuffle') {
    const poolSize = Math.max(300, page * limit * 3);
    const { data, error, count } = await buildQuery()
      .order('posted_at', { ascending: false, nullsFirst: false })
      .range(0, poolSize - 1);
    if (error || !data) {
      return NextResponse.json(buildJsonFallback({ category, region, brand, search, sortBy, page, limit }));
    }
    const rows = (data as Record<string, unknown>[]).map(contentRowToIgPostRow);
    const mapped = rows.map(toFeedPost);
    const randomised = spreadByBrand(shuffle(mapped));
    const start = (page - 1) * limit;
    const stats = await getStatsCached(client, { category, region, brand, search });
    const lastUpdated = await getLastCronRun().catch(() => null);
    const total = count || data.length;
    return NextResponse.json({
      posts: randomised.slice(start, start + limit),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      stats,
      source: 'supabase',
      lastUpdated,
    });
  }

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
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  q = q.range(from, to);

  const { data, error, count } = await q;

  if (error) {
    console.error('feed query error:', error.message);
  }

  const rawRows = (data as Record<string, unknown>[] | null) || [];

  if (!error && count === 0) {
    const fallback = buildJsonFallback({ category, region, brand, search, sortBy, page, limit });
    return NextResponse.json(fallback);
  }

  const rows = rawRows.map(contentRowToIgPostRow);
  const stats = await getStatsCached(client, { category, region, brand, search });
  const lastUpdated = await getLastCronRun().catch(() => null);

  const mapped = rows.map(toFeedPost);
  const interleaved = spreadByBrand(mapped);

  const payload: FeedResponse = {
    posts: interleaved,
    total: count || rows.length,
    page,
    totalPages: Math.max(1, Math.ceil((count || rows.length) / limit)),
    stats,
    source: 'supabase',
    lastUpdated,
  };
  return NextResponse.json(payload);
}

async function getStatsCached(
  client: ReturnType<typeof supabaseServer>,
  filters: { category: string | null; region: string | null; brand: string | null; search: string | null },
): Promise<FeedStats> {
  const cacheKey = `stats:${filters.category || ''}:${filters.region || ''}:${filters.brand || ''}:${filters.search || ''}`;
  const cached = STATS_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.stats;
  const stats = await computeStats(client, filters);
  STATS_CACHE.set(cacheKey, { stats, expiresAt: Date.now() + STATS_TTL_MS });
  return stats;
}

/* ─── Stats computation ─── */

async function computeStats(
  client: ReturnType<typeof supabaseServer>,
  filters: { category?: string | null; region?: string | null; brand?: string | null; search?: string | null },
): Promise<FeedStats> {
  let q = client
    .from('brand_content')
    .select('brand_handle,data,hashtags,engagement')
    .eq('type', 'ig_post')
    .order('posted_at', { ascending: false, nullsFirst: false })
    .limit(2000);

  if (filters.category && filters.category !== 'All') q = q.eq('data->>brand_category', filters.category);
  if (filters.region && filters.region !== 'All') q = q.eq('data->>brand_region', filters.region);
  if (filters.brand) q = q.eq('brand_handle', filters.brand);
  if (filters.search && filters.search.trim()) {
    const s = `%${filters.search.trim()}%`;
    q = q.or(`caption.ilike.${s},brand_handle.ilike.${s}`);
  }

  const { data } = await q;
  const rows = data || [];

  const brands = new Set<string>();
  const tagMap = new Map<string, number>();
  const typeMap = new Map<string, number>();
  const catMap = new Map<string, number>();
  const regMap = new Map<string, number>();
  let totalEng = 0;

  for (const r of rows as Array<{ brand_handle: string; data: Record<string, unknown>; hashtags: string[] | null; engagement: number }>) {
    brands.add(r.brand_handle);
    for (const t of r.hashtags || []) tagMap.set(t, (tagMap.get(t) || 0) + 1);
    const type = String((r.data as Record<string, unknown>)?.post_type || 'Image');
    typeMap.set(type, (typeMap.get(type) || 0) + 1);
    const cat = String((r.data as Record<string, unknown>)?.brand_category || 'Independent');
    catMap.set(cat, (catMap.get(cat) || 0) + 1);
    const reg = String((r.data as Record<string, unknown>)?.brand_region || 'Global');
    regMap.set(reg, (regMap.get(reg) || 0) + 1);
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
