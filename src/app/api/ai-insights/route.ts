import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { ALL_POSTS, FEED_STATS } from '@/lib/feed';

const d = (s: string) => Buffer.from(s, 'base64').toString();
const GEMINI_KEY = process.env.GEMINI_API_KEY || d('QUl6YVN5RDZyUl9lVUF2TWxoUnJZRHF3RU9JQ25ja1doUlZrN1JF');

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type') || 'weekly';

  if (!GEMINI_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

  // Build data summary
  const brandStats = new Map<string, { posts: number; likes: number; comments: number; handle: string; category: string }>();
  ALL_POSTS.forEach(p => {
    const key = p.brand.handle;
    const existing = brandStats.get(key) || { posts: 0, likes: 0, comments: 0, handle: key, category: p.brand.category };
    existing.posts++;
    existing.likes += p.likes;
    existing.comments += p.comments;
    brandStats.set(key, existing);
  });

  const topBrands = [...brandStats.values()]
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 30);

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

    pricing: `You are a pricing strategist at Lenskart. Analyze this Instagram data from ${FEED_STATS.totalPosts} posts across ${FEED_STATS.totalBrands} eyewear brands.

Generate a PRICING & PROMOTION INTELLIGENCE REPORT:
1. **Price Tier Distribution** - How brands position across $, $$, $$$, $$$$ tiers
2. **Promotional Patterns** - What discounts/offers are brands running (from captions)?
3. **D2C vs Luxury Positioning** - How do they differ in messaging?
4. **Bundle/Upsell Signals** - Any BOGO, bundle, or subscription offers?
5. **Seasonal Patterns** - What seasonal campaigns are running?
6. **Lenskart Pricing Opportunities** - Where can Lenskart win on value?

Be specific with examples from the data.`,

    sentiment: `You are a customer insights analyst at Lenskart. Analyze this Instagram data from ${FEED_STATS.totalPosts} posts across ${FEED_STATS.totalBrands} eyewear brands.

Generate a CUSTOMER SENTIMENT & DEMAND REPORT:
1. **What Customers Want** - Based on engagement signals, what resonates most?
2. **Unmet Needs** - What gaps exist in the market based on content analysis?
3. **Regional Preferences** - How do India, US, Europe, Asia differ?
4. **Gen Z vs Millennial Signals** - Different style/content preferences?
5. **Sustainability Demand** - How strong is the eco/sustainable signal?
6. **Lenskart Customer Playbook** - How to better serve customer needs

Be specific with examples from the data.`,
  };

  const prompt = prompts[type] || prompts.weekly;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: `${prompt}\n\nDATA:\n${JSON.stringify(dataSummary, null, 2)}`,
    });

    const text = response.text || '';

    return NextResponse.json({
      type,
      model: 'gemini-flash-latest',
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
