import { BRANDS } from './brands';
import scrapedData from '../data/scraped-feed.json';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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
}

function transformPosts(): Post[] {
  const raw = scrapedData as RawPost[];
  const posts: Post[] = [];

  for (const p of raw) {
    const handle = p.ownerUsername || '';
    if (!handle) continue;

    // Get image URL — prefer local downloaded image, then carousel, then displayUrl
    const imageUrl = (p as RawPost & { localImage?: string }).localImage
      || ((p.images && p.images.length > 0) ? p.images[0] : (p.displayUrl || ''));
    if (!imageUrl) continue;

    // Find brand info
    let brand = brandByHandle.get(handle);
    if (!brand) {
      // Try to find by checking if any brand handle matches
      for (const [h, b] of brandByHandle) {
        if (handle.includes(h) || h.includes(handle)) {
          brand = b;
          break;
        }
      }
    }
    if (!brand) {
      // Use post's inputUrl to find the brand
      if (p.inputUrl) {
        const match = p.inputUrl.match(/instagram\.com\/([^/]+)/);
        if (match) {
          brand = brandByHandle.get(match[1]);
        }
      }
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

    const likes = p.likesCount || 0;
    const comments = p.commentsCount || 0;

    posts.push({
      id: p.id || p.shortCode || `${handle}_${posts.length}`,
      brand,
      imageUrl,
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

  // Sort by most recent
  posts.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());

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
