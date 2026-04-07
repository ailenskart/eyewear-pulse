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

// 120 unique eyewear/sunglasses/glasses photos — no repeats
const EYEWEAR_PHOTOS = [
  // Sunglasses product shots & close-ups
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
  'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=600&h=600&fit=crop',
  // People wearing sunglasses / eyewear lifestyle
  'https://images.unsplash.com/photo-1525299374597-911581e1bdef?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1542728928-1413d1894ed1?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1520013817300-1f4c1cb245ef?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1504439904031-93ded9f93e4e?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1530103043960-ef38714abb15?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1504199367641-aba8151af406?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1516914589923-f105f1535f88?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1548536961-293e41df8809?w=600&h=600&fit=crop',
  // Fashion editorial / model shots
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1513956589380-bad6acb9b9d4?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=600&h=600&fit=crop',
  // Glasses / optical frames
  'https://images.unsplash.com/photo-1574258495973-f010dfbb5371?w=600&h=750&fit=crop',
  'https://images.unsplash.com/photo-1612460638512-2a89ae965619?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1633621412960-bf87teleefb0?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1556015048-4d3aa10df74c?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1618354691438-25bc04584c23?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1598966739654-5e9a252d8c32?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1604066914354-ac81e6de56aa?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1576017421796-ff41b5b0e6ea?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1561948955-570b270e7c36?w=600&h=600&fit=crop',
  // Beach / outdoor / adventure with sunglasses
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1505881502353-a1986add3762?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1523635716635-3a93b1a70c1e?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1494783367193-149034c05e8f?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1471922694854-ff1b63b20054?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1510414842594-a61c69b5ae57?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1499793983394-e82e41d0b043?w=600&h=600&fit=crop',
  // Urban street style
  'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1485218126466-34e6a5c8e0c4?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1475180098004-ca77a66827be?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1445205170230-053b83016050?w=600&h=600&fit=crop',
  // Flat lay / product styling
  'https://images.unsplash.com/photo-1556015048-4d3aa10df74c?w=600&h=750&fit=crop',
  'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1596804902934-6fa7fe5f24b3?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1558171813-4c088753af8f?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1557183305-cd4c69970316?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1560343090-f0409e92791a?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&h=600&fit=crop',
  // Sports / active with eyewear
  'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1461896836934-bd45ba0c42a5?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1486218119243-13883505764c?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1526676037777-05a232554f77?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&h=600&fit=crop',
  // Luxury / high fashion
  'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1558191053-a93d3aa6b0d2?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1504703395950-b89145a5425b?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1543076499-a6133cb932fd?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1506152983158-b4a74a01c721?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1495385794356-15371f348c31?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=600&h=600&fit=crop',
  // Portraits with glasses
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=750&fit=crop',
  'https://images.unsplash.com/photo-1488161628813-04466f872be2?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1519058082700-08a0b56da9b4?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1504257432389-52343af06ae3?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1463453091185-61582044d556?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=600&h=600&fit=crop',
  // Colorful / artistic
  'https://images.unsplash.com/photo-1550684376-efcbd6e3f031?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1558980394-0a06c4631733?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1558171814-2e52d3e12e30?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1551721434-8b94ddff0e6d?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1558383409-5765b0bff4ac?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1560343776-97e7d202ff0e?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&h=600&fit=crop',
  // Workspace / behind the scenes
  'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1558655146-d09347e92766?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1581093588401-fbb62a02f120?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1586717791821-3f44a563fa4c?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1558655146-364adaf1fcc9?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1581291518633-83b4eef1d2fa?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1559028012-481c04fa702d?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1558655146-9f430cfc7ee8?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1572044162444-ad60f128bdea?w=600&h=600&fit=crop',
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
