import { NextRequest, NextResponse } from 'next/server';
import { ALL_POSTS, FEED_STATS } from '@/lib/feed';

export async function GET(request: NextRequest) {
  const compare = request.nextUrl.searchParams.get('compare'); // e.g. "warbyparker,zennioptical"

  // ── Top posts by likes ──
  const topPosts = ALL_POSTS
    .filter(p => p.likes > 0 && p.imageUrl)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 10)
    .map(p => ({
      brand: p.brand.name, handle: p.brand.handle, caption: p.caption.substring(0, 150),
      likes: p.likes, comments: p.comments, imageUrl: p.imageUrl, postUrl: p.postUrl, type: p.type,
    }));

  // ── Brand leaderboard ──
  const brandMap = new Map<string, { name: string; handle: string; category: string; region: string; posts: number; likes: number; comments: number; videos: number; carousels: number; images: number; avgLikes: number; topPostLikes: number }>();
  ALL_POSTS.forEach(p => {
    const key = p.brand.handle;
    const e = brandMap.get(key);
    if (!e) {
      brandMap.set(key, {
        name: p.brand.name, handle: key, category: p.brand.category, region: p.brand.region,
        posts: 1, likes: p.likes, comments: p.comments,
        videos: p.type === 'Video' ? 1 : 0, carousels: p.type === 'Sidecar' ? 1 : 0, images: p.type === 'Image' ? 1 : 0,
        avgLikes: p.likes, topPostLikes: p.likes,
      });
    } else {
      e.posts++; e.likes += p.likes; e.comments += p.comments;
      if (p.type === 'Video') e.videos++; else if (p.type === 'Sidecar') e.carousels++; else e.images++;
      if (p.likes > e.topPostLikes) e.topPostLikes = p.likes;
      e.avgLikes = Math.round(e.likes / e.posts);
    }
  });
  const brandLeaderboard = [...brandMap.values()].sort((a, b) => b.likes - a.likes).slice(0, 20);

  // ── Content performance ──
  const typePerf = new Map<string, { count: number; totalLikes: number; totalComments: number }>();
  ALL_POSTS.forEach(p => {
    const t = p.type || 'Unknown';
    const e = typePerf.get(t) || { count: 0, totalLikes: 0, totalComments: 0 };
    e.count++; e.totalLikes += p.likes; e.totalComments += p.comments;
    typePerf.set(t, e);
  });
  const contentPerformance = [...typePerf.entries()].map(([type, d]) => ({
    type, count: d.count, avgLikes: Math.round(d.totalLikes / d.count),
    avgComments: Math.round(d.totalComments / d.count), pct: Math.round(d.count / ALL_POSTS.length * 100),
  })).sort((a, b) => b.count - a.count);

  // ── Categories ──
  const catMap = new Map<string, { posts: number; likes: number; brands: Set<string>; topBrand: string; topLikes: number }>();
  ALL_POSTS.forEach(p => {
    const e = catMap.get(p.brand.category) || { posts: 0, likes: 0, brands: new Set<string>(), topBrand: '', topLikes: 0 };
    e.posts++; e.likes += p.likes; e.brands.add(p.brand.handle);
    if (p.likes > e.topLikes) { e.topBrand = p.brand.name; e.topLikes = p.likes; }
    catMap.set(p.brand.category, e);
  });
  const categories = [...catMap.entries()].map(([name, d]) => ({
    name, posts: d.posts, totalLikes: d.likes, brands: d.brands.size, topBrand: d.topBrand,
  })).sort((a, b) => b.posts - a.posts);

  // ── Regions ──
  const regionMap = new Map<string, { posts: number; likes: number; brands: Set<string> }>();
  ALL_POSTS.forEach(p => {
    const e = regionMap.get(p.brand.region) || { posts: 0, likes: 0, brands: new Set<string>() };
    e.posts++; e.likes += p.likes; e.brands.add(p.brand.handle);
    regionMap.set(p.brand.region, e);
  });
  const regions = [...regionMap.entries()].map(([name, d]) => ({
    name, posts: d.posts, totalLikes: d.likes, brands: d.brands.size,
  })).sort((a, b) => b.posts - a.posts);

  // ── Influencer Discovery ──
  const mentionCounts = new Map<string, { count: number; byBrands: Set<string> }>();
  ALL_POSTS.forEach(p => {
    const caption = p.caption || '';
    const found = caption.match(/@([\w.]+)/g) || [];
    found.forEach(m => {
      const handle = m.substring(1).toLowerCase();
      if (handle.length < 3) return;
      const e = mentionCounts.get(handle) || { count: 0, byBrands: new Set<string>() };
      e.count++; e.byBrands.add(p.brand.name);
      mentionCounts.set(handle, e);
    });
  });
  const influencers = [...mentionCounts.entries()]
    .filter(([, d]) => d.byBrands.size >= 2) // mentioned by at least 2 different brands
    .map(([handle, d]) => ({
      handle, mentions: d.count, brands: [...d.byBrands].slice(0, 5), brandCount: d.byBrands.size,
    }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 25);

  // ── Trend Alerts (viral posts: >5x average likes) ──
  const avgLikes = ALL_POSTS.reduce((s, p) => s + p.likes, 0) / Math.max(ALL_POSTS.length, 1);
  const viralThreshold = avgLikes * 5;
  const trendAlerts = ALL_POSTS
    .filter(p => p.likes > viralThreshold)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 10)
    .map(p => ({
      brand: p.brand.name, handle: p.brand.handle, likes: p.likes, comments: p.comments,
      caption: p.caption.substring(0, 150), imageUrl: p.imageUrl, postUrl: p.postUrl,
      multiplier: parseFloat((p.likes / avgLikes).toFixed(1)),
      type: p.type, postedAt: p.postedAt,
    }));

  // ── Content Calendar (best performing day/hour patterns) ──
  const dayPerf = new Map<string, { posts: number; likes: number }>();
  const hourPerf = new Map<number, { posts: number; likes: number }>();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  ALL_POSTS.forEach(p => {
    const date = new Date(p.postedAt);
    if (isNaN(date.getTime())) return;
    const day = days[date.getUTCDay()];
    const hour = date.getUTCHours();
    const de = dayPerf.get(day) || { posts: 0, likes: 0 };
    de.posts++; de.likes += p.likes; dayPerf.set(day, de);
    const he = hourPerf.get(hour) || { posts: 0, likes: 0 };
    he.posts++; he.likes += p.likes; hourPerf.set(hour, he);
  });
  const bestDays = [...dayPerf.entries()].map(([day, d]) => ({
    day, posts: d.posts, avgLikes: d.posts > 0 ? Math.round(d.likes / d.posts) : 0,
  })).sort((a, b) => b.avgLikes - a.avgLikes);
  const bestHours = [...hourPerf.entries()].map(([hour, d]) => ({
    hour: `${hour}:00 UTC`, posts: d.posts, avgLikes: d.posts > 0 ? Math.round(d.likes / d.posts) : 0,
  })).sort((a, b) => b.avgLikes - a.avgLikes).slice(0, 8);

  // ── Brand Comparison (if requested) ──
  let brandComparison = null;
  if (compare) {
    const handles = compare.split(',').map(h => h.trim().toLowerCase());
    brandComparison = handles.map(h => {
      const posts = ALL_POSTS.filter(p => p.brand.handle === h);
      if (posts.length === 0) return { handle: h, found: false };
      const brand = posts[0].brand;
      const totalLikes = posts.reduce((s, p) => s + p.likes, 0);
      const totalComments = posts.reduce((s, p) => s + p.comments, 0);
      const videos = posts.filter(p => p.type === 'Video').length;
      const carousels = posts.filter(p => p.type === 'Sidecar').length;
      const images = posts.filter(p => p.type === 'Image').length;
      const topPost = posts.sort((a, b) => b.likes - a.likes)[0];
      return {
        handle: h, found: true, name: brand.name, category: brand.category, region: brand.region,
        posts: posts.length, totalLikes, totalComments,
        avgLikes: Math.round(totalLikes / posts.length),
        avgComments: Math.round(totalComments / posts.length),
        contentMix: { videos, carousels, images },
        topPost: topPost ? { caption: topPost.caption.substring(0, 100), likes: topPost.likes, imageUrl: topPost.imageUrl, postUrl: topPost.postUrl } : null,
        hashtags: [...new Set(posts.flatMap(p => p.hashtags))].slice(0, 10),
      };
    });
  }

  return NextResponse.json({
    summary: {
      totalPosts: FEED_STATS.totalPosts, totalBrands: FEED_STATS.totalBrands,
      avgEngagement: FEED_STATS.avgEngagement,
      totalLikes: ALL_POSTS.reduce((s, p) => s + p.likes, 0),
      totalComments: ALL_POSTS.reduce((s, p) => s + p.comments, 0),
      avgLikesPerPost: Math.round(ALL_POSTS.reduce((s, p) => s + p.likes, 0) / Math.max(ALL_POSTS.length, 1)),
    },
    topPosts,
    brandLeaderboard,
    contentPerformance,
    categories,
    regions,
    topHashtags: FEED_STATS.topHashtags,
    influencers,
    trendAlerts,
    bestDays,
    bestHours,
    brandComparison,
  });
}
