import { NextRequest, NextResponse } from 'next/server';
import { BRANDS } from '@/lib/brands';
import {
  getFullInsights,
  generateFallbackInsights,
  scrapeHashtag,
  type InstaInsights,
  type InstaPost,
} from '@/lib/instatouch-scraper';

/* ------------------------------------------------------------------ */
/*  GET /api/instagram-insights                                        */
/*  Query params:                                                      */
/*    handle   — single brand handle to get deep insights              */
/*    hashtag  — scrape an eyewear hashtag feed                        */
/*    compare  — comma-separated handles for comparison                */
/*    session  — optional Instagram session cookie                     */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const handle = searchParams.get('handle');
  const hashtag = searchParams.get('hashtag');
  const compare = searchParams.get('compare');
  const session = searchParams.get('session') || undefined;

  const config = { session, postCount: 50, timeout: 15000 };

  // ── Single brand deep insights ──
  if (handle) {
    const brand = BRANDS.find(b => b.handle === handle);
    const insights = await getFullInsights(handle, config);

    if (insights) {
      return NextResponse.json({ ...insights, brand: brand || null });
    }

    // Fallback
    const fallback = generateFallbackInsights(
      handle,
      brand?.name || handle,
      brand?.category || 'D2C',
      brand?.followerEstimate || 50000,
    );
    return NextResponse.json({ ...fallback, brand: brand || null });
  }

  // ── Hashtag feed analysis ──
  if (hashtag) {
    const posts = await scrapeHashtag(hashtag, config);

    if (posts.length > 0) {
      const analysis = analyzeHashtagFeed(posts, hashtag);
      return NextResponse.json(analysis);
    }

    // Fallback with generated data
    return NextResponse.json(generateHashtagFallback(hashtag));
  }

  // ── Comparison mode ──
  if (compare) {
    const handles = compare.split(',').slice(0, 10); // max 10
    const results: Array<InstaInsights & { brand: typeof BRANDS[0] | null }> = [];

    for (const h of handles) {
      const brand = BRANDS.find(b => b.handle === h.trim());
      const insights = await getFullInsights(h.trim(), config);

      if (insights) {
        results.push({ ...insights, brand: brand || null });
      } else {
        const fallback = generateFallbackInsights(
          h.trim(),
          brand?.name || h.trim(),
          brand?.category || 'D2C',
          brand?.followerEstimate || 50000,
        );
        results.push({ ...fallback, brand: brand || null });
      }
    }

    return NextResponse.json({
      comparison: results.map(r => ({
        handle: r.profile.handle,
        name: r.profile.fullName,
        followers: r.profile.followers,
        engagementRate: r.engagementRate,
        avgLikes: r.avgLikes,
        avgComments: r.avgComments,
        postingFrequency: r.postingFrequency,
        contentMix: r.contentMix,
        topHashtags: r.topHashtags.slice(0, 5),
        isVerified: r.profile.isVerified,
        isLive: r.isLive,
      })),
    });
  }

  // ── Global overview (no params) ──
  return NextResponse.json(generateGlobalOverview());
}

/* ------------------------------------------------------------------ */
/*  Analyze a hashtag feed                                             */
/* ------------------------------------------------------------------ */

function analyzeHashtagFeed(posts: InstaPost[], hashtag: string) {
  const totalLikes = posts.reduce((s, p) => s + p.likes, 0);
  const totalComments = posts.reduce((s, p) => s + p.comments, 0);
  const avgLikes = posts.length ? Math.round(totalLikes / posts.length) : 0;
  const avgComments = posts.length ? Math.round(totalComments / posts.length) : 0;

  // Top co-occurring hashtags
  const allTags = posts.flatMap(p => p.hashtags).filter(t => t !== `#${hashtag}`);
  const tagCounts = new Map<string, number>();
  allTags.forEach(t => tagCounts.set(t, (tagCounts.get(t) || 0) + 1));
  const topCoTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag, count]) => ({ tag, count }));

  // Content type breakdown
  const images = posts.filter(p => p.type === 'image').length;
  const videos = posts.filter(p => p.type === 'video').length;
  const carousels = posts.filter(p => p.type === 'sidecar').length;

  // Top mentioned accounts
  const allMentions = posts.flatMap(p => p.mentions);
  const mentionCounts = new Map<string, number>();
  allMentions.forEach(m => mentionCounts.set(m, (mentionCounts.get(m) || 0) + 1));
  const topMentions = Array.from(mentionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([mention, count]) => ({ mention, count }));

  return {
    hashtag,
    postCount: posts.length,
    avgLikes,
    avgComments,
    topCoTags,
    contentMix: { images, videos, carousels },
    topMentions,
    topPosts: posts
      .sort((a, b) => b.likes - a.likes)
      .slice(0, 6)
      .map(p => ({
        shortcode: p.shortcode,
        likes: p.likes,
        comments: p.comments,
        type: p.type,
        caption: p.caption.substring(0, 200),
        displayUrl: p.displayUrl,
      })),
    isLive: true,
    scrapedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/*  Fallback data generators                                           */
/* ------------------------------------------------------------------ */

function generateHashtagFallback(hashtag: string) {
  const s = hashtag.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const eyewearCoTags = [
    '#sunglasses', '#eyewearfashion', '#opticalframes', '#luxuryeyewear',
    '#designerframes', '#eyewearstyle', '#glassesofinstagram', '#sunnies',
    '#spectacles', '#frameoftheday', '#eyewearlover', '#fashioneyewear',
    '#eyeweartrends', '#premiumeyewear', '#eyeweardesign',
  ];

  return {
    hashtag,
    postCount: 200 + (s % 300),
    avgLikes: 800 + (s % 2000),
    avgComments: 30 + (s % 100),
    topCoTags: eyewearCoTags.slice(0, 10).map((tag, i) => ({
      tag,
      count: 50 - i * 4 + (s % 10),
    })),
    contentMix: {
      images: 120 + (s % 80),
      videos: 40 + (s % 30),
      carousels: 20 + (s % 20),
    },
    topMentions: [
      { mention: '@rayban', count: 25 },
      { mention: '@oakley', count: 18 },
      { mention: '@warbyparker', count: 15 },
      { mention: '@gentlemonster', count: 12 },
      { mention: '@moscot', count: 9 },
    ],
    topPosts: Array.from({ length: 6 }, (_, i) => ({
      shortcode: `${hashtag}_${i}`,
      likes: 5000 - i * 600 + (s % 500),
      comments: 200 - i * 25 + (s % 50),
      type: i % 3 === 0 ? 'video' : 'image',
      caption: `Trending #${hashtag} eyewear look ${i + 1}`,
      displayUrl: `https://picsum.photos/1080/1080?random=${s}_${i}`,
    })),
    isLive: false,
    scrapedAt: new Date().toISOString(),
  };
}

function generateGlobalOverview() {
  // Aggregate from the brand database
  const categoryStats = new Map<string, { brands: number; followers: number; avgEng: number }>();
  const regionStats = new Map<string, { brands: number; followers: number; avgEng: number }>();

  BRANDS.forEach(b => {
    const eng = (b.avgLikes / b.followerEstimate) * 100;

    // Category
    const cs = categoryStats.get(b.category) || { brands: 0, followers: 0, avgEng: 0 };
    cs.brands++;
    cs.followers += b.followerEstimate;
    cs.avgEng += eng;
    categoryStats.set(b.category, cs);

    // Region
    const rs = regionStats.get(b.region) || { brands: 0, followers: 0, avgEng: 0 };
    rs.brands++;
    rs.followers += b.followerEstimate;
    rs.avgEng += eng;
    regionStats.set(b.region, rs);
  });

  const categoryBreakdown = Array.from(categoryStats.entries()).map(([cat, s]) => ({
    category: cat,
    brands: s.brands,
    totalFollowers: s.followers,
    avgEngagement: parseFloat((s.avgEng / s.brands).toFixed(2)),
  })).sort((a, b) => b.totalFollowers - a.totalFollowers);

  const regionBreakdown = Array.from(regionStats.entries()).map(([region, s]) => ({
    region,
    brands: s.brands,
    totalFollowers: s.followers,
    avgEngagement: parseFloat((s.avgEng / s.brands).toFixed(2)),
  })).sort((a, b) => b.totalFollowers - a.totalFollowers);

  const topByFollowers = [...BRANDS]
    .sort((a, b) => b.followerEstimate - a.followerEstimate)
    .slice(0, 25)
    .map(b => ({
      name: b.name,
      handle: b.handle,
      category: b.category,
      region: b.region,
      followers: b.followerEstimate,
      engagement: parseFloat(((b.avgLikes / b.followerEstimate) * 100).toFixed(2)),
    }));

  const topByEngagement = [...BRANDS]
    .map(b => ({ ...b, eng: (b.avgLikes / b.followerEstimate) * 100 }))
    .sort((a, b) => b.eng - a.eng)
    .slice(0, 25)
    .map(b => ({
      name: b.name,
      handle: b.handle,
      category: b.category,
      region: b.region,
      followers: b.followerEstimate,
      engagement: parseFloat(b.eng.toFixed(2)),
    }));

  // Eyewear-specific hashtag intelligence
  const trendingHashtags = [
    { tag: '#eyewear', estimatedPosts: 42000000, trend: 'stable' },
    { tag: '#sunglasses', estimatedPosts: 38000000, trend: 'growing' },
    { tag: '#eyewearfashion', estimatedPosts: 8500000, trend: 'growing' },
    { tag: '#designereyewear', estimatedPosts: 5200000, trend: 'growing' },
    { tag: '#luxuryeyewear', estimatedPosts: 3800000, trend: 'hot' },
    { tag: '#opticalframes', estimatedPosts: 2100000, trend: 'stable' },
    { tag: '#glassesofinstagram', estimatedPosts: 1900000, trend: 'growing' },
    { tag: '#eyewearstyle', estimatedPosts: 1700000, trend: 'hot' },
    { tag: '#sustainableeyewear', estimatedPosts: 890000, trend: 'hot' },
    { tag: '#smartglasses', estimatedPosts: 650000, trend: 'hot' },
    { tag: '#eyeweartrends2026', estimatedPosts: 420000, trend: 'hot' },
    { tag: '#vintageframes', estimatedPosts: 380000, trend: 'growing' },
  ];

  return {
    totalBrands: BRANDS.length,
    totalEstimatedFollowers: BRANDS.reduce((s, b) => s + b.followerEstimate, 0),
    avgEngagement: parseFloat(
      (BRANDS.reduce((s, b) => s + (b.avgLikes / b.followerEstimate) * 100, 0) / BRANDS.length).toFixed(2)
    ),
    categoryBreakdown,
    regionBreakdown,
    topByFollowers,
    topByEngagement,
    trendingHashtags,
    scrapedAt: new Date().toISOString(),
    isLive: false,
  };
}
