import { BRANDS, type Brand } from './brands';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Post {
  id: string;
  brand: {
    id: number;
    name: string;
    handle: string;
    category: Brand['category'];
    region: Brand['region'];
    priceRange: Brand['priceRange'];
  };
  imageUrl: string;
  caption: string;
  likes: number;
  comments: number;
  engagement: number; // (likes+comments)/followers * 100
  hashtags: string[];
  postedAt: string; // ISO date
  type: 'product' | 'lifestyle' | 'campaign' | 'collab' | 'behind-the-scenes' | 'runway';
  style: string; // e.g. "oversized", "cat-eye", "aviator"
  material: string;
  color: string;
}

/* ------------------------------------------------------------------ */
/*  Eyewear-specific content pools                                     */
/* ------------------------------------------------------------------ */

const EYEWEAR_PHOTOS = [
  // Sunglasses & frames on models / flatlays
  'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1577803645773-f96470509666?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1509695507497-903c140c43b0?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1574258495973-f010dfbb5371?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1508296695146-257a814070b4?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1556306535-38febf6782e7?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1591076482161-42ce6da69f67?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1617714651429-0b1b3eb1f4f6?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1625591340248-b5d2bbb5e340?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1604772659841-a1612db7000f?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1516642499231-b82aca76f961?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1529590003495-b2646e2718bf?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1614715838608-dd527c46231d?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&h=600&fit=crop',
  // More variety: close-ups, lifestyle, fashion
  'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1466781783364-36c955e42a7f?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1559128010-7c1ad6e1b6a5?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1589642380614-4a8c2147b857?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1518991669955-9c7e78ec80ca?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1524673360092-e07b6a76e547?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1561458338-60c232e06f23?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1596804902934-6fa7fe5f24b3?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1534125268689-04ed4008d3e6?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1519125323398-675f0ddb6308?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1518991669955-9c7e78ec80ca?w=600&h=750&fit=crop',
  'https://images.unsplash.com/photo-1533856493515-9868f37b0c01?w=600&h=750&fit=crop',
  'https://images.unsplash.com/photo-1521038199265-bc482db0f923?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1516575334481-f85287c2c82d?w=600&h=750&fit=crop',
  'https://images.unsplash.com/photo-1504198266287-1659872e6590?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=600&h=750&fit=crop',
  'https://images.unsplash.com/photo-1488161628813-04466f872be2?w=600&h=750&fit=crop',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=600&h=750&fit=crop',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600&h=750&fit=crop',
  'https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1496345875659-11f7dd282d1d?w=600&h=750&fit=crop',
];

const STYLES = ['Oversized', 'Cat-Eye', 'Aviator', 'Round', 'Square', 'Geometric', 'Rimless', 'Wrap', 'Browline', 'Shield', 'Rectangular', 'Oval', 'Clubmaster', 'Wayfarer', 'Pilot'];
const MATERIALS = ['Acetate', 'Titanium', 'Stainless Steel', 'Bio-Acetate', 'TR-90', 'Wood', 'Carbon Fiber', 'Gold', 'Silver', 'Mixed'];
const COLORS = ['Black', 'Tortoise', 'Crystal', 'Gold', 'Silver', 'Navy', 'Burgundy', 'Green', 'Pink', 'Blue', 'Brown', 'White', 'Red', 'Champagne', 'Olive'];
const POST_TYPES: Post['type'][] = ['product', 'lifestyle', 'campaign', 'collab', 'behind-the-scenes', 'runway'];

const CAPTIONS_BY_TYPE: Record<Post['type'], string[]> = {
  product: [
    'New drop. {style} frames in {color} {material}.',
    'The {style} — now in {color}. Link in bio.',
    'Frame of the week: {style} in {color} {material}.',
    '{style} frames crafted from premium {material}.',
    'Introducing our latest {style} collection.',
    'Designed for those who dare. {style} in {color}.',
  ],
  lifestyle: [
    'Weekend vibes. #eyewear #sunglasses',
    'Streets of the city. Frames that fit every moment.',
    'Your everyday essential. {style} in {color}.',
    'Made for the outdoors. {style} frames.',
    'Live bold. See different.',
    'From sunrise to sunset. #eyewearstyle',
  ],
  campaign: [
    'SS26 Campaign. Directed by {brand}.',
    'The new era of eyewear starts here.',
    'Our Spring/Summer 2026 collection is here.',
    'Vision. Redefined.',
    'See the world through our eyes. #newcollection',
    'Bold vision, bolder frames. SS26.',
  ],
  collab: [
    'Exclusive collaboration — limited edition.',
    'Two worlds collide. Our latest collab is live.',
    'Limited run. Don\'t miss this drop.',
    'A new perspective. Collab out now.',
    'Where fashion meets function. Collab edition.',
    'Handcrafted. Limited. Yours.',
  ],
  'behind-the-scenes': [
    'Inside the workshop. Every frame, handcrafted.',
    'The making of our {style} collection.',
    'From sketch to frame. Behind the scenes.',
    'Our artisans at work. Quality you can see.',
    'The details make the difference.',
    'Craftsmanship in every curve.',
  ],
  runway: [
    'Fresh off the runway. FW26 eyewear.',
    'Spotted at Fashion Week. {style} frames.',
    'Runway to retail. Coming soon.',
    'Fashion Week exclusive. #runway #eyewear',
    'The moment. The frame. #FashionWeek',
    'Straight from the catwalk. {style} in {color}.',
  ],
};

const HASHTAG_POOLS = [
  '#eyewear', '#sunglasses', '#eyewearfashion', '#designereyewear', '#luxuryeyewear',
  '#opticalframes', '#eyewearstyle', '#glassesofinstagram', '#sunnies', '#spectacles',
  '#frameoftheday', '#eyewearlover', '#fashioneyewear', '#eyeweartrends', '#premiumeyewear',
  '#eyeweardesign', '#sunglassesfashion', '#eyewearaddict', '#newframes', '#framegoals',
  '#eyewearinspo', '#sustainableeyewear', '#smartglasses', '#vintageframes', '#streetstyle',
  '#ootd', '#fashion', '#style', '#luxury', '#mensfashion', '#womensfashion',
];

/* ------------------------------------------------------------------ */
/*  Deterministic seeded random                                        */
/* ------------------------------------------------------------------ */

function seeded(i: number, salt = 0): number {
  return ((((i + salt) * 2654435761) >>> 0) % 10000) / 10000;
}

function pick<T>(arr: T[], i: number, salt = 0): T {
  return arr[Math.floor(seeded(i, salt) * arr.length)];
}

/* ------------------------------------------------------------------ */
/*  Generate posts for all brands                                      */
/* ------------------------------------------------------------------ */

function generatePosts(): Post[] {
  const posts: Post[] = [];
  const now = Date.now();

  for (const brand of BRANDS) {
    // Each brand gets 3-6 posts
    const postCount = 3 + Math.floor(seeded(brand.id, 999) * 4);

    for (let p = 0; p < postCount; p++) {
      const idx = brand.id * 100 + p;
      const postType = pick(POST_TYPES, idx, 1);
      const style = pick(STYLES, idx, 2);
      const material = pick(MATERIALS, idx, 3);
      const color = pick(COLORS, idx, 4);

      // Generate caption
      const captionTemplate = pick(CAPTIONS_BY_TYPE[postType], idx, 5);
      const caption = captionTemplate
        .replace('{style}', style)
        .replace('{material}', material)
        .replace('{color}', color)
        .replace('{brand}', brand.name);

      // Generate hashtags (3-7)
      const tagCount = 3 + Math.floor(seeded(idx, 6) * 5);
      const hashtags: string[] = [];
      for (let t = 0; t < tagCount; t++) {
        const tag = pick(HASHTAG_POOLS, idx + t, 7 + t);
        if (!hashtags.includes(tag)) hashtags.push(tag);
      }

      // Engagement
      const baseLikes = brand.avgLikes;
      const likeVariance = 0.5 + seeded(idx, 8) * 1.5; // 0.5x to 2x
      const likes = Math.round(baseLikes * likeVariance);
      const comments = Math.round(likes * (0.02 + seeded(idx, 9) * 0.06));
      const engagement = brand.followerEstimate > 0
        ? parseFloat(((likes + comments) / brand.followerEstimate * 100).toFixed(2))
        : 0;

      // Date (within last 30 days)
      const daysAgo = Math.floor(seeded(idx, 10) * 30);
      const hoursAgo = Math.floor(seeded(idx, 11) * 24);
      const postedAt = new Date(now - (daysAgo * 86400000 + hoursAgo * 3600000)).toISOString();

      // Image
      const imageUrl = EYEWEAR_PHOTOS[idx % EYEWEAR_PHOTOS.length];

      posts.push({
        id: `${brand.handle}_${p}`,
        brand: {
          id: brand.id,
          name: brand.name,
          handle: brand.handle,
          category: brand.category,
          region: brand.region,
          priceRange: brand.priceRange,
        },
        imageUrl,
        caption,
        likes,
        comments,
        engagement,
        hashtags,
        postedAt,
        type: postType,
        style,
        material,
        color,
      });
    }
  }

  return posts;
}

/* ------------------------------------------------------------------ */
/*  Cached feed (generated once at module load)                        */
/* ------------------------------------------------------------------ */

export const ALL_POSTS: Post[] = generatePosts();

// Pre-computed analytics
export const FEED_STATS = {
  totalPosts: ALL_POSTS.length,
  totalBrands: BRANDS.length,
  avgEngagement: parseFloat(
    (ALL_POSTS.reduce((s, p) => s + p.engagement, 0) / ALL_POSTS.length).toFixed(2)
  ),
  topStyles: countBy(ALL_POSTS, p => p.style).slice(0, 10),
  topMaterials: countBy(ALL_POSTS, p => p.material).slice(0, 8),
  topColors: countBy(ALL_POSTS, p => p.color).slice(0, 10),
  topHashtags: countBy(ALL_POSTS.flatMap(p => p.hashtags.map(() => '')), () => '')
    .slice(0, 0), // will be computed properly below
  contentMix: countBy(ALL_POSTS, p => p.type),
};

// Proper hashtag counting
const hashtagCounts = new Map<string, number>();
ALL_POSTS.forEach(p => p.hashtags.forEach(t => hashtagCounts.set(t, (hashtagCounts.get(t) || 0) + 1)));
FEED_STATS.topHashtags = Array.from(hashtagCounts.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .map(([name, count]) => ({ name, count }));

function countBy<T>(arr: T[], fn: (item: T) => string): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  arr.forEach(item => {
    const key = fn(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}
