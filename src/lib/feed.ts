import { BRANDS } from './brands';
import scrapedData from '../data/scraped-feed.json';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CarouselSlide {
  url: string;
  type: string;
}

export interface Post {
  id: string;
  brand: {
    name: string;
    handle: string;
    category: string;
    region: string;
    priceRange: string;
  };
  imageUrl: string;
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

/* ------------------------------------------------------------------ */
/*  Brand lookup                                                       */
/* ------------------------------------------------------------------ */

const brandByHandle = new Map(
  BRANDS.map(b => [b.handle, { name: b.name, handle: b.handle, category: b.category, region: b.region, priceRange: b.priceRange }])
);

/* ------------------------------------------------------------------ */
/*  Transform scraped data into feed posts                             */
/* ------------------------------------------------------------------ */

interface RawPost {
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
}

function proxyIgUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.includes('cdninstagram.com')) return `/api/img?url=${encodeURIComponent(url)}`;
  return url;
}

// Accounts that are definitely NOT eyewear — filter out their posts
const NON_EYEWEAR_ACCOUNTS = new Set([
  'aria_johnson_official_','cadillacf1','acmilan','archmanning','stonebrewing',
  '100thieves','100thieves.apparel','vuoriclothing','redbullusa','insomniacshop',
  'fbkadinbasket','theviewabc','gamerecognizegamepod','foxybaehair',
  '_miguelch','alexascore','biancaborck','beyondwland','daltondern','kohlfromsd',
  'afashionnerd','asly.official','whatpeoplearewearing','aleezabenshalom',
]);

// Eyewear keywords — posts with these in caption are likely relevant
const EYEWEAR_KEYWORDS = /glasses|eyewear|sunglass|frame|optical|lens|spectacle|aviator|wayfarer|polarized|prescription|blue.?light|eyecare|optician/i;

function isEyewearRelevant(p: RawPost): boolean {
  const handle = (p.ownerUsername || '').toLowerCase();
  // Exclude known non-eyewear accounts
  if (NON_EYEWEAR_ACCOUNTS.has(handle)) return false;
  // If it's a known brand, always include
  if (brandByHandle.has(handle)) return true;
  // If caption mentions eyewear terms, include
  const caption = p.caption || '';
  if (EYEWEAR_KEYWORDS.test(caption)) return true;
  // If it has eyewear hashtags, include
  const tags = (p.hashtags || []).join(' ');
  if (EYEWEAR_KEYWORDS.test(tags)) return true;
  // Unknown account with no eyewear keywords — skip
  return false;
}

function transformPosts(): Post[] {
  const raw = scrapedData as RawPost[];
  const posts: Post[] = [];

  for (const p of raw) {
    const handle = p.ownerUsername || '';
    if (!handle) continue;
    if (!isEyewearRelevant(p)) continue;

    // Get image URL — prefer Blob (permanent), then proxy IG CDN through our server
    const rawUrl = p.blobUrl
      || ((p.images && p.images.length > 0) ? p.images[0] : (p.displayUrl || ''))
      || p.localImage
      || '';
    // Proxy Instagram CDN URLs through /api/img to avoid browser CORS blocks
    const imageUrl = rawUrl.includes('cdninstagram.com')
      ? `/api/img?url=${encodeURIComponent(rawUrl)}`
      : rawUrl;
    if (!imageUrl) continue;

    // Find brand info
    let brand = brandByHandle.get(handle);
    if (!brand) {
      for (const [h, b] of brandByHandle) {
        if (handle.includes(h) || h.includes(handle)) {
          brand = b;
          break;
        }
      }
    }
    if (!brand && p.inputUrl) {
      const match = p.inputUrl.match(/instagram\.com\/([^/]+)/);
      if (match) brand = brandByHandle.get(match[1]);
    }
    if (!brand) {
      brand = {
        name: p.ownerFullName || handle,
        handle,
        category: 'Independent',
        region: 'North America',
        priceRange: '$$',
      };
    }

    // Fix -1 likes: treat negative values as 0
    const likes = Math.max(0, p.likesCount || 0);
    const comments = Math.max(0, p.commentsCount || 0);

    posts.push({
      id: p.id || p.shortCode || `${handle}_${posts.length}`,
      brand,
      imageUrl,
      videoUrl: proxyIgUrl(p.videoBlobUrl || p.videoUrl || null),
      carouselSlides: (p.carouselSlides || []).map(s => ({
        ...s,
        url: s.url.includes('cdninstagram.com') ? `/api/img?url=${encodeURIComponent(s.url)}` : s.url,
      })),
      caption: p.caption || '',
      likes,
      comments,
      engagement: likes > 0 ? parseFloat(((likes + comments) / Math.max(likes * 10, 1) * 100).toFixed(2)) : 0,
      hashtags: p.hashtags || [],
      postedAt: p.timestamp || new Date().toISOString(),
      postUrl: p.url || `https://www.instagram.com/p/${p.shortCode}/`,
      type: p.type || 'Image',
      isVideo: !!p.videoUrl,
    });
  }

  // Default sort: D2C first, then by recency, then by likes
  posts.sort((a, b) => {
    // D2C brands get priority
    const aIsD2C = a.brand.category === 'D2C' ? 1 : 0;
    const bIsD2C = b.brand.category === 'D2C' ? 1 : 0;
    if (aIsD2C !== bIsD2C) return bIsD2C - aIsD2C;
    // Then by recency
    const timeDiff = new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    // Then by likes
    return b.likes - a.likes;
  });

  return posts;
}

/* ------------------------------------------------------------------ */
/*  Cached feed                                                        */
/* ------------------------------------------------------------------ */

export const ALL_POSTS: Post[] = transformPosts();

function countBy(arr: Post[], fn: (item: Post) => string): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  arr.forEach(item => {
    const key = fn(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

// Hashtag counting
const hashtagCounts = new Map<string, number>();
ALL_POSTS.forEach(p => p.hashtags.forEach(t => hashtagCounts.set(t, (hashtagCounts.get(t) || 0) + 1)));

export const FEED_STATS = {
  totalPosts: ALL_POSTS.length,
  totalBrands: new Set(ALL_POSTS.map(p => p.brand.handle)).size,
  avgEngagement: parseFloat(
    (ALL_POSTS.reduce((s, p) => s + p.engagement, 0) / Math.max(ALL_POSTS.length, 1)).toFixed(2)
  ),
  topHashtags: Array.from(hashtagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count })),
  contentMix: countBy(ALL_POSTS, p => p.type),
  byCategory: countBy(ALL_POSTS, p => p.brand.category),
  byRegion: countBy(ALL_POSTS, p => p.brand.region),
};
