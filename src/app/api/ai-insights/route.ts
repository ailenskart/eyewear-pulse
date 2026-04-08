import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { ALL_POSTS, FEED_STATS } from '@/lib/feed';
import { ANTHROPIC_KEY } from '@/lib/env';

const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type') || 'weekly';

  if (!ANTHROPIC_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set — add it to Vercel env vars or src/lib/env.ts' }, { status: 500 });
  }

  // Build data summary for Claude
  const topBrands = [...new Map<string, { posts: number; likes: number; comments: number; handle: string }>(
    ALL_POSTS.map(p => [p.brand.handle, { posts: 0, likes: 0, comments: 0, handle: p.brand.handle }])
  ).entries()].map(([, v]) => {
    ALL_POSTS.filter(p => p.brand.handle === v.handle).forEach(p => {
      v.posts++;
      v.likes += p.likes;
      v.comments += p.comments;
    });
    return v;
  }).sort((a, b) => b.likes - a.likes).slice(0, 30);

  const topCaptions = ALL_POSTS
    .filter(p => p.likes > 0)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 20)
    .map(p => ({
      brand: p.brand.name,
      caption: p.caption.substring(0, 200),
      likes: p.likes,
      comments: p.comments,
      type: p.type,
      hashtags: p.hashtags.slice(0, 5),
    }));

  const dataSummary = {
    totalPosts: FEED_STATS.totalPosts,
    totalBrands: FEED_STATS.totalBrands,
    avgEngagement: FEED_STATS.avgEngagement,
    topHashtags: FEED_STATS.topHashtags.slice(0, 15),
    contentMix: FEED_STATS.contentMix,
    byCategory: FEED_STATS.byCategory,
    byRegion: FEED_STATS.byRegion,
    topBrands,
    topCaptions,
  };

  const prompts: Record<string, string> = {
    weekly: `You are an eyewear industry analyst at Lenskart. Analyze this Instagram data from ${FEED_STATS.totalPosts} posts across ${FEED_STATS.totalBrands} global eyewear brands.

Generate a WEEKLY INTELLIGENCE BRIEF with these sections:
1. **Top Trends This Week** - What styles, themes, colors are dominating feeds?
2. **Engagement Winners** - Which brands/content types are getting the most engagement and why?
3. **Content Strategy Insights** - What type of content (Video/Image/Carousel) performs best? What caption styles work?
4. **Competitive Moves** - Notable campaigns, launches, or shifts from competitors
5. **Opportunities for Lenskart** - Specific actionable recommendations based on gaps/trends
6. **Regional Highlights** - Notable differences across regions

Keep it sharp, data-driven, and actionable. Use specific numbers from the data.`,

    product: `You are a product development strategist at Lenskart. Analyze this Instagram data from ${FEED_STATS.totalPosts} posts across ${FEED_STATS.totalBrands} eyewear brands.

Generate a PRODUCT INTELLIGENCE REPORT:
1. **Trending Frame Styles** - What shapes/silhouettes are brands pushing?
2. **Material Trends** - Any signals about materials (acetate, titanium, bio-materials)?
3. **Color Palette Trends** - What colors dominate posts?
4. **Price Positioning** - How are D2C vs Luxury vs Fast Fashion positioning?
5. **Design Recommendations** - What should Lenskart's next collection focus on?
6. **Fast-to-Market Opportunities** - Quick wins based on trending styles

Be specific and actionable.`,

    content: `You are a social media strategist at Lenskart. Analyze this Instagram data from ${FEED_STATS.totalPosts} posts across ${FEED_STATS.totalBrands} eyewear brands.

Generate a CONTENT STRATEGY REPORT:
1. **What Content Works** - Video vs Image vs Carousel performance
2. **Optimal Posting Patterns** - Frequency, timing insights
3. **Caption Best Practices** - What caption styles drive engagement?
4. **Hashtag Strategy** - Top performing hashtags and recommendations
5. **Influencer/Creator Signals** - Any creator collaborations showing up?
6. **Lenskart Content Playbook** - Specific content ideas to test next week

Be specific with examples from the data.`,
  };

  const prompt = prompts[type] || prompts.weekly;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `${prompt}\n\nDATA:\n${JSON.stringify(dataSummary, null, 2)}`,
      }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';

    return NextResponse.json({
      type,
      generatedAt: new Date().toISOString(),
      insights: text,
      dataPoints: {
        postsAnalyzed: FEED_STATS.totalPosts,
        brandsTracked: FEED_STATS.totalBrands,
        avgEngagement: FEED_STATS.avgEngagement,
      },
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'AI analysis failed',
    }, { status: 500 });
  }
}
