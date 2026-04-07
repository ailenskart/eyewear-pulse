import { NextRequest, NextResponse } from 'next/server';
import { ALL_POSTS, FEED_STATS } from '@/lib/feed';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const category = searchParams.get('category');
  const region = searchParams.get('region');
  const brand = searchParams.get('brand');
  const search = searchParams.get('search');
  const sortBy = searchParams.get('sortBy') || 'recent';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '40');

  let filtered = [...ALL_POSTS];

  if (category && category !== 'All') {
    filtered = filtered.filter(p => p.brand.category === category);
  }
  if (region && region !== 'All') {
    filtered = filtered.filter(p => p.brand.region === region);
  }
  if (brand) {
    filtered = filtered.filter(p => p.brand.handle === brand);
  }
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(p =>
      p.brand.name.toLowerCase().includes(s) ||
      p.brand.handle.toLowerCase().includes(s) ||
      p.caption.toLowerCase().includes(s) ||
      p.hashtags.some(h => h.toLowerCase().includes(s))
    );
  }

  switch (sortBy) {
    case 'likes':
      filtered.sort((a, b) => b.likes - a.likes);
      break;
    case 'engagement':
      filtered.sort((a, b) => b.engagement - a.engagement);
      break;
    case 'comments':
      filtered.sort((a, b) => b.comments - a.comments);
      break;
    case 'recent':
    default:
      filtered.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
      break;
  }

  const total = filtered.length;
  const start = (page - 1) * limit;
  const posts = filtered.slice(start, start + limit);

  return NextResponse.json({
    posts,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    stats: FEED_STATS,
  });
}
