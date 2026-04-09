import { NextResponse } from 'next/server';
import { ALL_POSTS } from '@/lib/feed';

export async function GET() {
  const posts = ALL_POSTS.filter(p => p.likes > 0);

  // ── Content Type Performance ──
  const typeMap = new Map<string, { count: number; likes: number; comments: number }>();
  ALL_POSTS.forEach(p => {
    const t = p.type || 'Unknown';
    const e = typeMap.get(t) || { count: 0, likes: 0, comments: 0 };
    e.count++; e.likes += p.likes; e.comments += p.comments;
    typeMap.set(t, e);
  });
  const contentPerformance = [...typeMap.entries()].map(([type, d]) => ({
    type, count: d.count,
    avgLikes: Math.round(d.likes / d.count),
    avgComments: Math.round(d.comments / d.count),
    pct: Math.round(d.count / ALL_POSTS.length * 100),
  })).sort((a, b) => b.avgLikes - a.avgLikes);

  // ── Caption Length vs Performance ──
  const captionBuckets = [
    { label: 'No caption', min: 0, max: 1 },
    { label: 'Short (1-50)', min: 1, max: 50 },
    { label: 'Medium (50-150)', min: 50, max: 150 },
    { label: 'Long (150-300)', min: 150, max: 300 },
    { label: 'Very long (300+)', min: 300, max: 99999 },
  ];
  const captionPerformance = captionBuckets.map(b => {
    const group = posts.filter(p => p.caption.length >= b.min && p.caption.length < b.max);
    return {
      label: b.label, count: group.length,
      avgLikes: group.length ? Math.round(group.reduce((s, p) => s + p.likes, 0) / group.length) : 0,
    };
  });

  // ── Hashtag Count vs Performance ──
  const hashtagBuckets = [
    { label: '0 tags', min: 0, max: 1 },
    { label: '1-2 tags', min: 1, max: 3 },
    { label: '3-5 tags', min: 3, max: 6 },
    { label: '6-10 tags', min: 6, max: 11 },
    { label: '10+ tags', min: 11, max: 999 },
  ];
  const hashtagPerformance = hashtagBuckets.map(b => {
    const group = posts.filter(p => p.hashtags.length >= b.min && p.hashtags.length < b.max);
    return {
      label: b.label, count: group.length,
      avgLikes: group.length ? Math.round(group.reduce((s, p) => s + p.likes, 0) / group.length) : 0,
    };
  });

  // ── Brand Leaderboard ──
  const brandMap = new Map<string, { name: string; handle: string; category: string; posts: number; likes: number; comments: number; videos: number; carousels: number; images: number }>();
  ALL_POSTS.forEach(p => {
    const e = brandMap.get(p.brand.handle);
    if (!e) {
      brandMap.set(p.brand.handle, { name: p.brand.name, handle: p.brand.handle, category: p.brand.category, posts: 1, likes: p.likes, comments: p.comments, videos: p.type === 'Video' ? 1 : 0, carousels: p.type === 'Sidecar' ? 1 : 0, images: p.type === 'Image' ? 1 : 0 });
    } else {
      e.posts++; e.likes += p.likes; e.comments += p.comments;
      if (p.type === 'Video') e.videos++; else if (p.type === 'Sidecar') e.carousels++; else e.images++;
    }
  });
  const brandLeaderboard = [...brandMap.values()]
    .filter(b => b.posts >= 3)
    .map(b => ({ ...b, avgLikes: Math.round(b.likes / b.posts) }))
    .sort((a, b) => b.avgLikes - a.avgLikes)
    .slice(0, 15);

  // ── Top 10 Posts (viral content) ──
  const topPosts = [...ALL_POSTS]
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 10)
    .map(p => ({
      brand: p.brand.name, handle: p.brand.handle, caption: p.caption.substring(0, 120),
      likes: p.likes, comments: p.comments, type: p.type,
      imageUrl: p.imageUrl, postUrl: p.postUrl, engagement: p.engagement,
    }));

  // ── Posting Frequency Analysis ──
  const postsByBrand = new Map<string, number>();
  ALL_POSTS.forEach(p => postsByBrand.set(p.brand.handle, (postsByBrand.get(p.brand.handle) || 0) + 1));
  const avgPostsPerBrand = Math.round([...postsByBrand.values()].reduce((s, v) => s + v, 0) / postsByBrand.size);

  // ── Key Insights (auto-generated) ──
  const bestType = contentPerformance[0];
  const bestCaptionLen = captionPerformance.sort((a, b) => b.avgLikes - a.avgLikes)[0];
  const bestHashtagCount = hashtagPerformance.sort((a, b) => b.avgLikes - a.avgLikes)[0];
  const topBrand = brandLeaderboard[0];

  const insights = [
    { icon: '🎬', title: `${bestType.type} content wins`, desc: `${bestType.type} posts get ${bestType.avgLikes.toLocaleString()} avg likes — ${Math.round(bestType.avgLikes / (contentPerformance.find(c => c.type === 'Image')?.avgLikes || 1))}x more than static images.`, impact: 'high' },
    { icon: '✍️', title: `${bestCaptionLen.label} captions perform best`, desc: `Posts with ${bestCaptionLen.label.toLowerCase()} captions average ${bestCaptionLen.avgLikes.toLocaleString()} likes. Too long = lower engagement.`, impact: 'high' },
    { icon: '#️⃣', title: `${bestHashtagCount.label} is the sweet spot`, desc: `Posts with ${bestHashtagCount.label.toLowerCase()} average ${bestHashtagCount.avgLikes.toLocaleString()} likes. More hashtags = less engagement.`, impact: 'medium' },
    { icon: '🏆', title: `${topBrand.name} leads engagement`, desc: `${topBrand.avgLikes.toLocaleString()} avg likes per post across ${topBrand.posts} posts. Their strategy: ${topBrand.videos > topBrand.images ? 'video-heavy' : topBrand.carousels > topBrand.images ? 'carousel-heavy' : 'image-focused'}.`, impact: 'medium' },
    { icon: '📊', title: `${avgPostsPerBrand} posts per brand avg`, desc: `Top brands post ${brandLeaderboard[0]?.posts || 0} times in this period. Consistency matters more than volume.`, impact: 'low' },
  ];

  // ── Category Performance ──
  const catMap = new Map<string, { posts: number; likes: number; brands: Set<string> }>();
  ALL_POSTS.forEach(p => {
    const e = catMap.get(p.brand.category) || { posts: 0, likes: 0, brands: new Set<string>() };
    e.posts++; e.likes += p.likes; e.brands.add(p.brand.handle);
    catMap.set(p.brand.category, e);
  });
  const categories = [...catMap.entries()].map(([name, d]) => ({
    name, posts: d.posts, avgLikes: Math.round(d.likes / d.posts), brands: d.brands.size,
  })).sort((a, b) => b.avgLikes - a.avgLikes);

  return NextResponse.json({
    insights,
    contentPerformance,
    captionPerformance: captionPerformance.sort((a, b) => b.avgLikes - a.avgLikes),
    hashtagPerformance: hashtagPerformance.sort((a, b) => b.avgLikes - a.avgLikes),
    brandLeaderboard,
    topPosts,
    categories,
    summary: { totalPosts: ALL_POSTS.length, totalBrands: brandMap.size },
  });
}
