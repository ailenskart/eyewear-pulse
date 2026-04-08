import { NextResponse } from 'next/server';
import { ALL_POSTS, FEED_STATS } from '@/lib/feed';

export async function GET() {
  // Top posts by likes (with images)
  const topPosts = ALL_POSTS
    .filter(p => p.likes > 0 && p.imageUrl)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 10)
    .map(p => ({
      brand: p.brand.name,
      handle: p.brand.handle,
      caption: p.caption.substring(0, 150),
      likes: p.likes,
      comments: p.comments,
      imageUrl: p.imageUrl,
      postUrl: p.postUrl,
      type: p.type,
    }));

  // Brand leaderboard (by total likes)
  const brandMap = new Map<string, { name: string; handle: string; category: string; posts: number; likes: number; comments: number; topPost: string; topPostUrl: string; topPostImage: string }>();
  ALL_POSTS.forEach(p => {
    const key = p.brand.handle;
    const existing = brandMap.get(key);
    if (!existing) {
      brandMap.set(key, {
        name: p.brand.name, handle: p.brand.handle, category: p.brand.category,
        posts: 1, likes: p.likes, comments: p.comments,
        topPost: p.caption.substring(0, 100), topPostUrl: p.postUrl, topPostImage: p.imageUrl,
      });
    } else {
      existing.posts++;
      existing.likes += p.likes;
      existing.comments += p.comments;
      if (p.likes > 0 && p.imageUrl) {
        existing.topPost = p.caption.substring(0, 100);
        existing.topPostUrl = p.postUrl;
        existing.topPostImage = p.imageUrl;
      }
    }
  });
  const brandLeaderboard = [...brandMap.values()]
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 20);

  // Content type performance
  const typePerf = new Map<string, { count: number; totalLikes: number; totalComments: number }>();
  ALL_POSTS.forEach(p => {
    const t = p.type || 'Unknown';
    const existing = typePerf.get(t) || { count: 0, totalLikes: 0, totalComments: 0 };
    existing.count++;
    existing.totalLikes += p.likes;
    existing.totalComments += p.comments;
    typePerf.set(t, existing);
  });
  const contentPerformance = [...typePerf.entries()].map(([type, d]) => ({
    type,
    count: d.count,
    avgLikes: Math.round(d.totalLikes / d.count),
    avgComments: Math.round(d.totalComments / d.count),
    pct: Math.round(d.count / ALL_POSTS.length * 100),
  })).sort((a, b) => b.count - a.count);

  // Category breakdown with top brand per category
  const catMap = new Map<string, { posts: number; likes: number; brands: Set<string>; topBrand: string; topLikes: number }>();
  ALL_POSTS.forEach(p => {
    const cat = p.brand.category;
    const existing = catMap.get(cat) || { posts: 0, likes: 0, brands: new Set(), topBrand: '', topLikes: 0 };
    existing.posts++;
    existing.likes += p.likes;
    existing.brands.add(p.brand.handle);
    if (p.likes > existing.topLikes) {
      existing.topBrand = p.brand.name;
      existing.topLikes = p.likes;
    }
    catMap.set(cat, existing);
  });
  const categories = [...catMap.entries()].map(([name, d]) => ({
    name, posts: d.posts, totalLikes: d.likes, brands: d.brands.size,
    topBrand: d.topBrand, topLikes: d.topLikes,
  })).sort((a, b) => b.posts - a.posts);

  // Region breakdown
  const regionMap = new Map<string, { posts: number; likes: number; brands: Set<string> }>();
  ALL_POSTS.forEach(p => {
    const r = p.brand.region;
    const existing = regionMap.get(r) || { posts: 0, likes: 0, brands: new Set() };
    existing.posts++;
    existing.likes += p.likes;
    existing.brands.add(p.brand.handle);
    regionMap.set(r, existing);
  });
  const regions = [...regionMap.entries()].map(([name, d]) => ({
    name, posts: d.posts, totalLikes: d.likes, brands: d.brands.size,
  })).sort((a, b) => b.posts - a.posts);

  return NextResponse.json({
    summary: {
      totalPosts: FEED_STATS.totalPosts,
      totalBrands: FEED_STATS.totalBrands,
      avgEngagement: FEED_STATS.avgEngagement,
      totalLikes: ALL_POSTS.reduce((s, p) => s + p.likes, 0),
      totalComments: ALL_POSTS.reduce((s, p) => s + p.comments, 0),
    },
    topPosts,
    brandLeaderboard,
    contentPerformance,
    categories,
    regions,
    topHashtags: FEED_STATS.topHashtags,
  });
}
