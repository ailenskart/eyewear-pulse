/**
 * Feed database layer.
 *
 * All reads and writes against the `ig_posts` table go through this
 * file so the shape coming out matches the `Post` interface the UI
 * expects (same one the legacy `src/lib/feed.ts` JSON loader used).
 *
 * Two responsibilities:
 *   1. toDbRow()  — take a raw scraped post (from Apify or the old
 *      scraped-feed.json) and map it to an `ig_posts` row.
 *   2. toFeedPost() — take an `ig_posts` row and map it back into
 *      the `Post` shape the client components render.
 */

import { supabaseServer } from '@/lib/supabase';
import { BRANDS } from '@/lib/brands';

export interface CarouselSlide { url: string; type: string }

export interface Post {
  id: string;
  brand: { name: string; handle: string; category: string; region: string; priceRange: string };
  imageUrl: string;
  rawImageUrl: string;
  videoUrl: string | null;
  carouselSlides: CarouselSlide[];
  caption: string;
  likes: number;
  comments: number;
  engagement: number;
  hashtags: string[];
  postedAt: string;
  postUrl: string;
  type: string;
  isVideo: boolean;
}

/* ─── Brand lookup ─── */

const BRAND_BY_HANDLE = new Map(
  BRANDS.map(b => [b.handle, { name: b.name, handle: b.handle, category: b.category, region: b.region, priceRange: b.priceRange }])
);

export function brandMetaForHandle(handle: string, fallbackName?: string): {
  name: string; handle: string; category: string; region: string; priceRange: string;
} {
  const direct = BRAND_BY_HANDLE.get(handle);
  if (direct) return direct;
  // Try partial match (old scraped data has some handle drift)
  for (const [h, b] of BRAND_BY_HANDLE) {
    if (handle.includes(h) || h.includes(handle)) return b;
  }
  return {
    name: fallbackName || handle,
    handle,
    category: 'Independent',
    region: 'North America',
    priceRange: '$$',
  };
}

/* ─── URL proxying ─── */

function proxyIgUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.includes('cdninstagram.com')) return `/api/img?url=${encodeURIComponent(url)}`;
  return url;
}

/* ─── Raw scraped post shape (Apify output or legacy JSON) ─── */

export interface RawScrapedPost {
  id?: string;
  shortCode?: string;
  caption?: string;
  url?: string;
  commentsCount?: number;
  likesCount?: number;
  displayUrl?: string;
  images?: string[];
  timestamp?: string;
  ownerUsername?: string;
  ownerFullName?: string;
  hashtags?: string[];
  mentions?: string[];
  type?: string;
  videoUrl?: string;
  inputUrl?: string;
  localImage?: string;
  blobUrl?: string;
  videoBlobUrl?: string;
  carouselSlides?: Array<{ url: string; type: string }>;
  childPosts?: Array<{ id?: string; type?: string; displayUrl?: string; videoUrl?: string }>;
}

/* ─── Excluded accounts (creator noise, not brands) ─── */

const NON_BRAND_ACCOUNTS = new Set([
  'aria_johnson_official_','cadillacf1','acmilan','archmanning','stonebrewing',
  '100thieves','100thieves.apparel','vuoriclothing','redbullusa','insomniacshop',
  'fbkadinbasket','theviewabc','gamerecognizegamepod','foxybaehair',
  '_miguelch','alexascore','biancaborck','beyondwland','daltondern','kohlfromsd',
  'afashionnerd','asly.official','whatpeoplearewearing','aleezabenshalom',
  '_fukatchonde_','a.blagochevskaya','raquelorozcog','madewithtrust','mpporcar',
  'ayla.madison','evaandreuc','fbkadinbasket','ally','lebicar','gabriel.lebleu',
  'everflow.social','angelmsandro','bigbitesvegas','ruidito','gabrielhanfling',
  'myrichmond.london','hw.reads','whatemmyreadss','whoopsee.it','organized_chaosblog',
  'team.vpa','laelwilcox','mikemarsal_racing','inna.sparrow.xr','dangitstrixie',
  'byshoncurtis','zoe_mcdougall','jweeeks','haileyelisee','tannertan36','micahhhrenee',
  'susiecevans','eatthecaketoo','cvazzana','zahrajoi','inspiredbytc','ymclondon',
  'rachaelkirkconnell','zoefeldmandesign','accesshub_inclusion','billybentley75',
  'australianlifemagazine','rezas','hellococogreen','bykarenwazen','mewpie',
  'helloth_official','gigiihinson','ontheboat__','hankapoislova','designblok_prague',
  'nikolmoravcova','roguevans','maxjuli','eyerepublic.store',
]);

export function isEyewearBrandHandle(handle: string): boolean {
  const h = handle.toLowerCase();
  if (!h) return false;
  if (NON_BRAND_ACCOUNTS.has(h)) return false;
  return true;
}

/* ─── Raw → DB row ─── */

export interface IgPostDbRow {
  id: string;
  brand_handle: string;
  brand_name: string | null;
  brand_category: string | null;
  brand_region: string | null;
  brand_price_range: string | null;
  caption: string | null;
  likes: number;
  comments: number;
  engagement: number;
  post_type: string | null;
  post_url: string | null;
  image_url: string | null;
  blob_url: string | null;
  video_url: string | null;
  video_blob_url: string | null;
  is_video: boolean;
  hashtags: string[] | null;
  mentions: string[] | null;
  carousel_slides: CarouselSlide[];
  posted_at: string | null;
  scraped_at?: string;
}

export function toDbRow(p: RawScrapedPost): IgPostDbRow | null {
  const handle = (p.ownerUsername || '').toLowerCase();
  if (!handle) return null;
  if (!isEyewearBrandHandle(handle)) return null;
  const id = String(p.id || p.shortCode || '');
  if (!id) return null;

  const brand = brandMetaForHandle(handle, p.ownerFullName);
  const likes = Math.max(0, p.likesCount || 0);
  const comments = Math.max(0, p.commentsCount || 0);
  const engagement = likes > 0 ? parseFloat(((likes + comments) / Math.max(likes * 10, 1) * 100).toFixed(2)) : 0;

  // Slides
  const slides: CarouselSlide[] = [];
  if (p.carouselSlides && p.carouselSlides.length > 0) {
    slides.push(...p.carouselSlides);
  } else if (p.childPosts && p.childPosts.length > 0) {
    for (const c of p.childPosts) {
      if (c.displayUrl) slides.push({ url: c.displayUrl, type: c.type || 'Image' });
    }
  }

  // Image URL — blob preferred, then images[0], then displayUrl
  const rawImage = p.blobUrl
    || (p.images && p.images[0])
    || p.displayUrl
    || p.localImage
    || '';

  return {
    id,
    brand_handle: handle,
    brand_name: brand.name,
    brand_category: brand.category,
    brand_region: brand.region,
    brand_price_range: brand.priceRange,
    caption: p.caption || '',
    likes,
    comments,
    engagement,
    post_type: p.type || 'Image',
    post_url: p.url || `https://www.instagram.com/p/${p.shortCode}/`,
    image_url: rawImage,
    blob_url: p.blobUrl || null,
    video_url: p.videoUrl || null,
    video_blob_url: p.videoBlobUrl || null,
    is_video: !!p.videoUrl,
    hashtags: p.hashtags || [],
    mentions: p.mentions || [],
    carousel_slides: slides,
    posted_at: p.timestamp || null,
  };
}

/* ─── DB row → feed Post (what the UI expects) ─── */

export function toFeedPost(r: IgPostDbRow): Post {
  const brand = {
    name: r.brand_name || r.brand_handle,
    handle: r.brand_handle,
    category: r.brand_category || 'Independent',
    region: r.brand_region || 'North America',
    priceRange: r.brand_price_range || '$$',
  };

  // Pick the best image URL in preference order.
  const rawImageUrl = r.blob_url || r.image_url || '';
  const imageUrl = rawImageUrl.includes('cdninstagram.com')
    ? `/api/img?url=${encodeURIComponent(rawImageUrl)}`
    : rawImageUrl;

  // Proxy any carousel slides that are on IG CDN
  const slides: CarouselSlide[] = (r.carousel_slides || []).map(s => ({
    ...s,
    url: s.url && s.url.includes('cdninstagram.com') ? `/api/img?url=${encodeURIComponent(s.url)}` : s.url,
  }));

  return {
    id: r.id,
    brand,
    imageUrl,
    rawImageUrl,
    videoUrl: proxyIgUrl(r.video_blob_url || r.video_url),
    carouselSlides: slides,
    caption: r.caption || '',
    likes: r.likes,
    comments: r.comments,
    engagement: Number(r.engagement) || 0,
    hashtags: r.hashtags || [],
    postedAt: r.posted_at || new Date().toISOString(),
    postUrl: r.post_url || '',
    type: r.post_type || 'Image',
    isVideo: r.is_video,
  };
}

/* ─── Batched upsert into brand_content (unified polymorphic table) ─── */

export async function upsertPosts(rows: IgPostDbRow[]): Promise<{ inserted: number; error?: string }> {
  if (rows.length === 0) return { inserted: 0 };
  const client = supabaseServer();

  // Map IgPostDbRow → brand_content row with type='ig_post'.
  // brand_id lookup via handle happens in batches to avoid N+1.
  const handles = Array.from(new Set(rows.map(r => r.brand_handle).filter(Boolean)));
  const { data: brandMap } = await client
    .from('tracked_brands')
    .select('id, handle')
    .in('handle', handles);
  const idByHandle = new Map<string, number>();
  for (const b of (brandMap || []) as Array<{ id: number; handle: string }>) {
    idByHandle.set(b.handle, b.id);
  }

  const contentRows = rows.map(r => ({
    brand_id: idByHandle.get(r.brand_handle) || null,
    brand_handle: r.brand_handle,
    type: 'ig_post',
    // `source` is a weak signal in prod (Apify + Mindcase both write
    // ig_post rows). Dedup is handled upstream via fetchExistingIds,
    // so the value here is just metadata.
    source: 'ig',
    source_ref: r.id,
    caption: r.caption,
    url: r.post_url,
    image_url: r.image_url,
    blob_url: r.blob_url,
    video_url: r.video_url,
    likes: r.likes || 0,
    comments: r.comments || 0,
    engagement: r.engagement || 0,
    hashtags: r.hashtags || [],
    posted_at: r.posted_at,
    data: {
      post_type: r.post_type,
      is_video: r.is_video,
      carousel_slides: r.carousel_slides,
      video_blob_url: r.video_blob_url,
      brand_name: r.brand_name,
      brand_category: r.brand_category,
      brand_region: r.brand_region,
      mentions: r.mentions,
    },
  }));

  // Plain insert — dedup is enforced upstream via fetchExistingIds().
  // Previously used .upsert() with onConflict:'brand_id,type,source,
  // source_ref' but the matching unique index was never applied in
  // prod, so every write failed with "no unique or exclusion
  // constraint matching the ON CONFLICT specification".
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < contentRows.length; i += BATCH) {
    const slice = contentRows.slice(i, i + BATCH);
    const { error } = await client.from('brand_content').insert(slice);
    if (error) return { inserted, error: error.message };
    inserted += slice.length;
  }
  return { inserted };
}

/* ─── Log cron runs ─── */

export async function logCronRun(input: {
  tier: string;
  brandsHit: number;
  newPosts: number;
  durationMs: number;
  error?: string;
}): Promise<void> {
  const client = supabaseServer();
  await client.from('feed_cron_runs').insert({
    tier: input.tier,
    brands_hit: input.brandsHit,
    new_posts: input.newPosts,
    duration_ms: input.durationMs,
    error: input.error || null,
  });
}

export async function getLastCronRun(tier?: string): Promise<{ ran_at: string; new_posts: number; tier: string } | null> {
  const client = supabaseServer();
  let q = client.from('feed_cron_runs').select('ran_at,new_posts,tier').order('ran_at', { ascending: false }).limit(1);
  if (tier) q = q.eq('tier', tier);
  const { data } = await q;
  return data && data[0] ? data[0] : null;
}
