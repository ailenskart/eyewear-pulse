import instaTouch from 'instatouch';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface InstaProfile {
  handle: string;
  fullName: string;
  biography: string;
  profilePicUrl: string;
  followers: number;
  following: number;
  posts: number;
  isVerified: boolean;
  externalUrl: string | null;
  isBusinessAccount: boolean;
  categoryName: string | null;
}

export interface InstaPost {
  id: string;
  shortcode: string;
  type: 'image' | 'video' | 'sidecar';
  caption: string;
  likes: number;
  comments: number;
  timestamp: number;
  displayUrl: string;
  dimensions: { width: number; height: number };
  hashtags: string[];
  mentions: string[];
  locationName: string | null;
}

export interface InstaInsights {
  profile: InstaProfile;
  recentPosts: InstaPost[];
  avgLikes: number;
  avgComments: number;
  engagementRate: number;
  postingFrequency: number; // posts per week
  topHashtags: Array<{ tag: string; count: number }>;
  topMentions: Array<{ mention: string; count: number }>;
  contentMix: { images: number; videos: number; carousels: number };
  peakPostingHours: number[];
  captionAvgLength: number;
  hashtagsPerPost: number;
  scrapedAt: string;
  isLive: boolean;
}

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

interface ScrapeConfig {
  postCount?: number;
  timeout?: number;
  session?: string;
  proxy?: string;
}

const DEFAULT_CONFIG: ScrapeConfig = {
  postCount: 50,
  timeout: 10000,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w\u00C0-\u024F]+/g);
  return matches ? matches.map(h => h.toLowerCase()) : [];
}

function extractMentions(text: string): string[] {
  const matches = text.match(/@[\w.]+/g);
  return matches ? matches.map(m => m.toLowerCase()) : [];
}

function countOccurrences(arr: string[]): Array<{ key: string; count: number }> {
  const map = new Map<string, number>();
  arr.forEach(item => map.set(item, (map.get(item) || 0) + 1));
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

/* ------------------------------------------------------------------ */
/*  Scrape user profile metadata                                       */
/* ------------------------------------------------------------------ */

export async function scrapeUserMeta(
  handle: string,
  config: ScrapeConfig = {}
): Promise<InstaProfile | null> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  try {
    const meta = await instaTouch.getUserMeta(handle, {
      timeout: opts.timeout,
      ...(opts.session ? { session: opts.session } : {}),
      ...(opts.proxy ? { proxy: opts.proxy } : {}),
    });

    if (!meta || !meta.graphql?.user) return null;

    const user = meta.graphql.user as Record<string, unknown>;
    const edgeFollowedBy = user.edge_followed_by as { count?: number } | undefined;
    const edgeFollow = user.edge_follow as { count?: number } | undefined;
    const edgeMedia = user.edge_owner_to_timeline_media as { count?: number } | undefined;

    return {
      handle: (user.username as string) || handle,
      fullName: (user.full_name as string) || '',
      biography: (user.biography as string) || '',
      profilePicUrl: (user.profile_pic_url_hd as string) || (user.profile_pic_url as string) || '',
      followers: edgeFollowedBy?.count || 0,
      following: edgeFollow?.count || 0,
      posts: edgeMedia?.count || 0,
      isVerified: (user.is_verified as boolean) || false,
      externalUrl: (user.external_url as string) || null,
      isBusinessAccount: (user.is_business_account as boolean) || false,
      categoryName: (user.category_name as string) || null,
    };
  } catch (err) {
    console.warn(`[instatouch] Failed to fetch meta for @${handle}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Scrape user posts                                                  */
/* ------------------------------------------------------------------ */

export async function scrapeUserPosts(
  handle: string,
  config: ScrapeConfig = {}
): Promise<InstaPost[]> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  try {
    const result = await instaTouch.user(handle, {
      count: opts.postCount,
      timeout: opts.timeout,
      ...(opts.session ? { session: opts.session } : {}),
      ...(opts.proxy ? { proxy: opts.proxy } : {}),
    });

    const collector = result?.collector || [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (collector as any[]).map((post) => {
      const caption = String(post.description || post.text || '');
      return {
        id: String(post.id || ''),
        shortcode: String(post.shortcode || ''),
        type: (post.is_video ? 'video' : (post.edge_sidecar_to_children ? 'sidecar' : 'image')) as InstaPost['type'],
        caption,
        likes: Number(post.likes || post.edge_liked_by?.count || 0),
        comments: Number(post.comments || post.edge_media_to_comment?.count || 0),
        timestamp: Number(post.taken_at_timestamp || Math.floor(Date.now() / 1000)),
        displayUrl: String(post.display_url || post.thumbnail_src || ''),
        dimensions: post.dimensions || { width: 1080, height: 1080 },
        hashtags: extractHashtags(caption),
        mentions: extractMentions(caption),
        locationName: post.location?.name || null,
      };
    });
  } catch (err) {
    console.warn(`[instatouch] Failed to fetch posts for @${handle}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Scrape hashtag feed                                                */
/* ------------------------------------------------------------------ */

export async function scrapeHashtag(
  tag: string,
  config: ScrapeConfig = {}
): Promise<InstaPost[]> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  try {
    const result = await instaTouch.hashtag(tag, {
      count: opts.postCount,
      timeout: opts.timeout,
      ...(opts.session ? { session: opts.session } : {}),
      ...(opts.proxy ? { proxy: opts.proxy } : {}),
    });

    const collector = result?.collector || [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (collector as any[]).map((post) => {
      const caption = String(post.description || post.text || '');
      return {
        id: String(post.id || ''),
        shortcode: String(post.shortcode || ''),
        type: (post.is_video ? 'video' : 'image') as InstaPost['type'],
        caption,
        likes: Number(post.likes || 0),
        comments: Number(post.comments || 0),
        timestamp: Number(post.taken_at_timestamp || Math.floor(Date.now() / 1000)),
        displayUrl: String(post.display_url || post.thumbnail_src || ''),
        dimensions: post.dimensions || { width: 1080, height: 1080 },
        hashtags: extractHashtags(caption),
        mentions: extractMentions(caption),
        locationName: post.location?.name || null,
      };
    });
  } catch (err) {
    console.warn(`[instatouch] Failed to fetch hashtag #${tag}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Full insights (profile + posts + analytics)                        */
/* ------------------------------------------------------------------ */

export async function getFullInsights(
  handle: string,
  config: ScrapeConfig = {}
): Promise<InstaInsights | null> {
  const [profile, posts] = await Promise.all([
    scrapeUserMeta(handle, config),
    scrapeUserPosts(handle, config),
  ]);

  if (!profile) return null;

  // Engagement metrics
  const totalLikes = posts.reduce((s, p) => s + p.likes, 0);
  const totalComments = posts.reduce((s, p) => s + p.comments, 0);
  const avgLikes = posts.length ? Math.round(totalLikes / posts.length) : 0;
  const avgComments = posts.length ? Math.round(totalComments / posts.length) : 0;
  const engagementRate = profile.followers > 0 && posts.length > 0
    ? ((avgLikes + avgComments) / profile.followers) * 100
    : 0;

  // Posting frequency (posts per week based on date range)
  let postingFrequency = 0;
  if (posts.length >= 2) {
    const sorted = [...posts].sort((a, b) => b.timestamp - a.timestamp);
    const newest = sorted[0].timestamp;
    const oldest = sorted[sorted.length - 1].timestamp;
    const weekSpan = Math.max(1, (newest - oldest) / (7 * 86400));
    postingFrequency = parseFloat((posts.length / weekSpan).toFixed(1));
  }

  // Top hashtags
  const allHashtags = posts.flatMap(p => p.hashtags);
  const topHashtags = countOccurrences(allHashtags)
    .slice(0, 20)
    .map(({ key, count }) => ({ tag: key, count }));

  // Top mentions
  const allMentions = posts.flatMap(p => p.mentions);
  const topMentions = countOccurrences(allMentions)
    .slice(0, 10)
    .map(({ key, count }) => ({ mention: key, count }));

  // Content mix
  const images = posts.filter(p => p.type === 'image').length;
  const videos = posts.filter(p => p.type === 'video').length;
  const carousels = posts.filter(p => p.type === 'sidecar').length;

  // Peak posting hours
  const hourCounts = new Array(24).fill(0);
  posts.forEach(p => {
    const hour = new Date(p.timestamp * 1000).getUTCHours();
    hourCounts[hour]++;
  });
  const maxHourCount = Math.max(...hourCounts);
  const peakPostingHours = hourCounts
    .map((count, hour) => ({ hour, count }))
    .filter(h => h.count >= maxHourCount * 0.7)
    .map(h => h.hour);

  // Caption analytics
  const captionAvgLength = posts.length
    ? Math.round(posts.reduce((s, p) => s + p.caption.length, 0) / posts.length)
    : 0;
  const hashtagsPerPost = posts.length
    ? parseFloat((allHashtags.length / posts.length).toFixed(1))
    : 0;

  return {
    profile,
    recentPosts: posts.slice(0, 12),
    avgLikes,
    avgComments,
    engagementRate: parseFloat(engagementRate.toFixed(2)),
    postingFrequency,
    topHashtags,
    topMentions,
    contentMix: { images, videos, carousels },
    peakPostingHours,
    captionAvgLength,
    hashtagsPerPost,
    scrapedAt: new Date().toISOString(),
    isLive: true,
  };
}

/* ------------------------------------------------------------------ */
/*  Generate fallback insights (when live scraping fails)              */
/* ------------------------------------------------------------------ */

export function generateFallbackInsights(
  handle: string,
  brandName: string,
  category: string,
  followerEstimate: number,
): InstaInsights {
  const s = handle.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = (min: number, max: number) => min + ((s * 2654435761 >>> 0) % (max - min));

  const engRate = 1.5 + (s % 40) / 10;
  const avgLikes = Math.round(followerEstimate * (engRate / 100));
  const avgComments = Math.round(avgLikes * 0.05);

  const eyewearTags = [
    '#eyewear', '#sunglasses', '#opticalframes', '#eyewearfashion', '#eyewearstyle',
    '#sunglassesfashion', '#designereyewear', '#luxuryeyewear', '#eyeweartrends',
    '#glassesofinstagram', '#eyewearlover', '#spectacles', '#eyeweardesign',
    '#sunglasseslover', '#frameoftheday', '#optician', '#eyeweardesigner',
    '#fashioneyewear', '#premiumeyewear', '#eyewearaddict',
  ];

  const topHashtags = eyewearTags.slice(0, 8 + (s % 5)).map((tag, i) => ({
    tag,
    count: Math.max(1, 15 - i * 2 + (s % 3)),
  }));

  const postFreq = category === 'Luxury' ? 3 + (s % 4) : category === 'D2C' ? 5 + (s % 5) : 2 + (s % 6);

  return {
    profile: {
      handle,
      fullName: brandName,
      biography: `${brandName} | Official Instagram | ${category} eyewear`,
      profilePicUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(brandName)}&size=150&background=6366f1&color=fff`,
      followers: followerEstimate,
      following: rand(200, 2000),
      posts: rand(300, 3000),
      isVerified: followerEstimate > 500000,
      externalUrl: `https://${handle}.com`,
      isBusinessAccount: true,
      categoryName: category,
    },
    recentPosts: Array.from({ length: 12 }, (_, i) => ({
      id: `${s}_${i}`,
      shortcode: `${handle}_${i}`,
      type: (i % 5 === 0 ? 'video' : i % 7 === 0 ? 'sidecar' : 'image') as InstaPost['type'],
      caption: `${brandName} — new collection ${2026} #eyewear #${handle}`,
      likes: avgLikes + ((s + i * 137) % (avgLikes / 2)),
      comments: avgComments + ((s + i * 41) % Math.max(1, avgComments)),
      timestamp: Math.floor(Date.now() / 1000) - i * 86400 * (1 + (s % 3)),
      displayUrl: `https://picsum.photos/1080/1080?random=${s}_${i}`,
      dimensions: { width: 1080, height: 1080 },
      hashtags: topHashtags.slice(0, 3 + (i % 3)).map(h => h.tag),
      mentions: [],
      locationName: null,
    })),
    avgLikes,
    avgComments,
    engagementRate: parseFloat(engRate.toFixed(2)),
    postingFrequency: postFreq,
    topHashtags,
    topMentions: [],
    contentMix: {
      images: 7 + (s % 3),
      videos: 2 + (s % 2),
      carousels: 1 + (s % 2),
    },
    peakPostingHours: [9, 12, 17, 19].slice(0, 2 + (s % 3)),
    captionAvgLength: rand(80, 300),
    hashtagsPerPost: parseFloat((5 + (s % 10)).toFixed(1)),
    scrapedAt: new Date().toISOString(),
    isLive: false,
  };
}

/* ------------------------------------------------------------------ */
/*  Batch scrape multiple handles                                      */
/* ------------------------------------------------------------------ */

export async function batchScrapeInsights(
  handles: Array<{ handle: string; name: string; category: string; followerEstimate: number }>,
  config: ScrapeConfig = {},
  concurrency = 2,
): Promise<InstaInsights[]> {
  const results: InstaInsights[] = [];
  const delay = 2000; // 2s between batches to avoid rate limits

  for (let i = 0; i < handles.length; i += concurrency) {
    const batch = handles.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const insights = await getFullInsights(item.handle, config);
        if (insights) return insights;
        return generateFallbackInsights(item.handle, item.name, item.category, item.followerEstimate);
      })
    );
    results.push(...batchResults);
    if (i + concurrency < handles.length) {
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return results;
}
