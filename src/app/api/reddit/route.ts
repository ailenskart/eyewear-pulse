import { NextRequest, NextResponse } from 'next/server';

/**
 * Reddit brand-mentions scraper.
 *
 * Uses Reddit's public JSON endpoints (no auth required) to
 * search for brand mentions across all of Reddit or within
 * specific eyewear-related subreddits. Returns post metadata,
 * vote counts, comment counts, and links so we can gauge
 * organic sentiment and community buzz.
 *
 * Usage:
 *   GET /api/reddit?q=lenskart
 *   GET /api/reddit?q=warby+parker&sub=glasses
 *   GET /api/reddit?q=oakley&sort=top&time=month
 */

const EYEWEAR_SUBS = [
  'glasses',
  'Sunglasses',
  'malefashionadvice',
  'femalefashionadvice',
  'Sustainability',
  'BuyItForLife',
  'streetwear',
  'fashion',
  'EDC',
];

const HEADERS = {
  'User-Agent': 'Lenzy/1.0 (competitive intelligence; https://lenzy.studio)',
  'Accept': 'application/json',
};

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  subreddit: string;
  author: string;
  score: number;
  upvote_ratio: number;
  num_comments: number;
  created_utc: number;
  permalink: string;
  url: string;
  thumbnail: string;
  preview?: { images?: Array<{ source?: { url?: string } }> };
  is_video: boolean;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = (searchParams.get('q') || '').trim();
  const sub = searchParams.get('sub') || ''; // optional single subreddit
  const sort = searchParams.get('sort') || 'relevance'; // relevance | hot | top | new | comments
  const time = searchParams.get('time') || 'month'; // hour | day | week | month | year | all
  const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100);

  if (!q) {
    return NextResponse.json({ error: 'q param required' }, { status: 400 });
  }

  try {
    let url: string;
    if (sub) {
      // Search within a specific subreddit
      url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(q)}&restrict_sr=1&sort=${sort}&t=${time}&limit=${limit}`;
    } else {
      // Global search but boosted with eyewear sub list
      const subFilter = EYEWEAR_SUBS.map(s => `subreddit:${s}`).join(' OR ');
      const query = `${q} (${subFilter})`;
      url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=${sort}&t=${time}&limit=${limit}`;
    }

    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      return NextResponse.json({ error: `Reddit returned ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const children = data?.data?.children || [];
    const posts = children.map((c: { data: RedditPost }) => {
      const p = c.data;
      const previewImg = p.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&');
      return {
        id: p.id,
        title: p.title,
        snippet: p.selftext ? p.selftext.substring(0, 280) : '',
        subreddit: p.subreddit,
        author: p.author,
        score: p.score,
        upvoteRatio: p.upvote_ratio,
        comments: p.num_comments,
        createdAt: new Date(p.created_utc * 1000).toISOString(),
        permalink: `https://reddit.com${p.permalink}`,
        externalUrl: p.url,
        thumbnail: previewImg || (p.thumbnail && p.thumbnail.startsWith('http') ? p.thumbnail : ''),
        isVideo: p.is_video,
      };
    });

    // Compute aggregate metrics
    const totalScore = posts.reduce((s: number, p: { score: number }) => s + p.score, 0);
    const totalComments = posts.reduce((s: number, p: { comments: number }) => s + p.comments, 0);
    const avgUpvoteRatio = posts.length > 0
      ? posts.reduce((s: number, p: { upvoteRatio: number }) => s + p.upvoteRatio, 0) / posts.length
      : 0;
    const subBreakdown: Record<string, number> = {};
    for (const p of posts as { subreddit: string }[]) {
      subBreakdown[p.subreddit] = (subBreakdown[p.subreddit] || 0) + 1;
    }

    return NextResponse.json({
      q,
      sub: sub || 'all eyewear subs',
      sort,
      time,
      posts,
      total: posts.length,
      stats: {
        totalScore,
        totalComments,
        avgUpvoteRatio: Math.round(avgUpvoteRatio * 100) / 100,
        subBreakdown: Object.entries(subBreakdown).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      },
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Reddit fetch failed',
    }, { status: 500 });
  }
}
