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
// Prevent Next.js from memoising a single shuffled response for all visitors.
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

// Tiny in-memory stats cache keyed by filter combo so repeated polls
// from the UI don't re-aggregate 2k+ rows.
const STATS_CACHE = new Map<string, { stats: FeedStats; expiresAt: number }>();
const STATS_TTL_MS = 2 * 60 * 1000;

/* ─── Randomisation + brand-spread helpers ─── */

// Proper Fisher-Yates shuffle (replaces the biased `sort(() => 0.5 - Math.random())`).
function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Round-robin interleave by brand so the same brand never appears
// back-to-back. Keeps feed looking varied even when one brand (e.g.
// Calvin Klein) has the top 3 most-liked posts in the window.
function spreadByBrand<T extends { brand: { handle: string } }>(posts: T[]): T[] {
  const byBrand = new Map<string, T[]>();
  for (const p of posts) {
    const k = p.brand.handle;
    if (!byBrand.has(k)) byBrand.set(k, []);
    byBrand.get(k)!.push(p);
  }
  // Shuffle the per-brand lists AND the brand visit order so
  // refreshing gives a different ordering each time.
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

// Score posts for the "recent" default sort. Recency + engagement,
// with a small random jitter so two calls return different top rows.
function freshnessScore(p: IgPostDbRow): number {
  const posted = p.posted_at ? new Date(p.posted_at).getTime() : 0;
  const hoursOld = posted > 0 ? (Date.now() - posted) / 3600000 : 10000;
  // Half-life: 14 days. After 14 days recency weight drops to ~0.5.
  const recency = Math.exp(-hoursOld / (24 * 14));
  const engagement = Math.log1p((Number(p.likes) || 0) + (Number(p.comments) || 0) * 5);
  const jitter = 0.85 + Math.random() * 0.3; // ±15% wobble
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

  // Recent (default) gets special treatment: pull a wider pool, score it,
  // Fisher-Yates shuffle within score buckets, then spread by brand.
  // Other sorts (likes / engagement / comments / shuffle) are deterministic
  // in the DB layer since users explicitly asked for that ordering.
  if (sortBy === 'recent') {
    // Pull the last N days' worth of posts (or 400 rows, whichever hits
    // first) so the in-memory shuffle has headroom to spread brands.
    const poolSize = Math.max(300, page * limit * 3);
    let q = buildQuery()
      .order('posted_at', { ascending: false, nullsFirst: false })
      .range(0, poolSize - 1);
    const { data, error, count } = await q;
    if (error) {
      console.error('feed query error:', error.message);
    }
    const rows = (data as IgPostDbRow[] | null) || [];
    if (!error && count === 0) {
      return NextResponse.json(buildJsonFallback({ category, region, brand, search, sortBy, page, limit }));
    }
    // Score + randomise + spread by brand
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
    case 'shuffle': {
      // Pure randomness: fetch 400 rows ordered by a stable signal,
      // shuffle in memory, then slice. Spreads brands too.
      const poolSize = Math.max(300, page * limit * 3);
      const { data, error, count } = await buildQuery()
        .order('posted_at', { ascending: false, nullsFirst: false })
        .range(0, poolSize - 1);
      if (error || !data) {
        return NextResponse.json(buildJsonFallback({ category, region, brand, search, sortBy, page, limit }));
      }
      const mapped = (data as IgPostDbRow[]).map(toFeedPost);
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
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  q = q.range(from, to);

  const { data, error, count } = await q;

  if (error) {
    console.error('feed query error:', error.message);
  }

  const rows = (data as IgPostDbRow[] | null) || [];

  if (!error && count === 0) {
    const fallback = buildJsonFallback({ category, region, brand, search, sortBy, page, limit });
    return NextResponse.json(fallback);
  }

  const stats = await getStatsCached(client, { category, region, brand, search });
  const lastUpdated = await getLastCronRun().catch(() => null);

  // Even for likes/engagement/comments sort, interleave brands so the top
  // doesn't get dominated by one brand's posts all in a row.
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
