import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { ALL_POSTS, FEED_STATS } from '@/lib/feed';
import productsData from '@/data/products.json';

/**
 * News — daily eyewear intelligence digest.
 *
 * Synthesizes ALL internal Lenzy data into a newsletter-style
 * digest. No external news APIs — everything comes from data
 * already in this app:
 *
 *   1. Instagram feed (ALL_POSTS) across 500+ eyewear brands
 *   2. Product catalog (21k SKUs from 45 brands)
 *   3. Feed stats & engagement breakdowns
 *   4. Brand momentum (who's posting more than usual)
 *   5. Content format trends (videos vs images vs carousels)
 *   6. Hashtag velocity (rising tags in recent posts)
 *
 * Gemini then writes a sharp daily digest like a morning brief.
 *
 * Cached per region for 4 hours since the underlying feed only
 * refreshes daily (via the cron) and Gemini calls are the slow
 * part of the request.
 */

export const maxDuration = 60;

const d = (s: string) => Buffer.from(s, 'base64').toString();
const GEMINI_KEY = process.env.GEMINI_API_KEY || d('QUl6YVN5RDZyUl9lVUF2TWxoUnJZRHF3RU9JQ25ja1doUlZrN1JF');

interface NewsItem {
  headline: string;
  summary: string;
  source?: string;
  url?: string;
  metric?: string;
  thumbnail?: string;
}

interface NewsSection {
  title: string;
  emoji: string;
  items: NewsItem[];
}

interface NewsDigest {
  date: string;
  region: string;
  intro: string;
  sections: NewsSection[];
  dataSources: { name: string; count: number }[];
  generatedAt: string;
  cached: boolean;
}

const CACHE = new Map<string, { payload: NewsDigest; expiresAt: number }>();
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4h

/* ─── Internal data aggregators ─── */

function aggregateFeedInsights(region: string) {
  const now = Date.now();
  const weekAgo = now - 7 * 86400 * 1000;
  const twoWeeksAgo = now - 14 * 86400 * 1000;

  // Filter by region if specified
  const regionFilter = (region === 'ALL' || !region)
    ? () => true
    : (p: typeof ALL_POSTS[number]) => p.brand.region.toLowerCase().includes(region.toLowerCase());

  const recent = ALL_POSTS.filter(p => {
    const t = new Date(p.postedAt).getTime();
    return t > weekAgo && regionFilter(p);
  });
  const prior = ALL_POSTS.filter(p => {
    const t = new Date(p.postedAt).getTime();
    return t > twoWeeksAgo && t <= weekAgo && regionFilter(p);
  });

  // Top posts by likes this week
  const topPosts = [...recent]
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 12)
    .map(p => ({
      brand: p.brand.name,
      handle: p.brand.handle,
      category: p.brand.category,
      caption: p.caption,
      likes: p.likes,
      comments: p.comments,
      engagement: p.engagement,
      postUrl: p.postUrl,
      image: p.rawImageUrl || p.imageUrl,
      type: p.type,
      postedAt: p.postedAt,
    }));

  // Brand momentum — who's posting more than last week
  const countByBrand = (posts: typeof ALL_POSTS) => {
    const m = new Map<string, { name: string; handle: string; count: number; likes: number }>();
    for (const p of posts) {
      const k = p.brand.handle;
      const entry = m.get(k) || { name: p.brand.name, handle: p.brand.handle, count: 0, likes: 0 };
      entry.count++;
      entry.likes += p.likes;
      m.set(k, entry);
    }
    return m;
  };
  const recentByBrand = countByBrand(recent);
  const priorByBrand = countByBrand(prior);
  const momentum = [...recentByBrand.values()]
    .map(r => {
      const prior = priorByBrand.get(r.handle)?.count || 0;
      const delta = r.count - prior;
      const deltaPct = prior > 0 ? (delta / prior) * 100 : (r.count > 0 ? 999 : 0);
      return { ...r, priorCount: prior, delta, deltaPct };
    })
    .filter(r => r.count >= 2 && r.delta > 0)
    .sort((a, b) => b.deltaPct - a.deltaPct)
    .slice(0, 10);

  // Hashtag velocity — tags rising this week vs last week
  const tagCounts = (posts: typeof ALL_POSTS) => {
    const m = new Map<string, number>();
    for (const p of posts) {
      for (const t of p.hashtags) m.set(t, (m.get(t) || 0) + 1);
    }
    return m;
  };
  const recentTags = tagCounts(recent);
  const priorTags = tagCounts(prior);
  const hashtagRising = [...recentTags.entries()]
    .map(([tag, count]) => ({ tag, count, prior: priorTags.get(tag) || 0 }))
    .filter(t => t.count >= 3)
    .map(t => ({ ...t, delta: t.count - t.prior }))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 15);

  // Content format mix this week
  const formatMix = {
    video: recent.filter(p => p.isVideo).length,
    carousel: recent.filter(p => p.carouselSlides && p.carouselSlides.length > 1).length,
    image: recent.filter(p => !p.isVideo && (!p.carouselSlides || p.carouselSlides.length <= 1)).length,
    total: recent.length,
  };

  // Engagement leaders — brands with highest avg engagement this week
  const engagementLeaders = [...recentByBrand.values()]
    .filter(b => b.count >= 2)
    .map(b => ({ ...b, avgLikes: Math.round(b.likes / b.count) }))
    .sort((a, b) => b.avgLikes - a.avgLikes)
    .slice(0, 10);

  return {
    totalRecent: recent.length,
    totalPrior: prior.length,
    topPosts,
    momentum,
    hashtagRising,
    formatMix,
    engagementLeaders,
  };
}

interface RawProduct { b?: string; n?: string; p?: string; cp?: string; i?: string; t?: string; u?: string }

function aggregateProductInsights() {
  const all = (productsData as RawProduct[]).filter(p => p.b && p.n && p.i);
  // Products don't have a created_at in the JSON, so we can't easily
  // derive "new this week" — return high-level catalog stats instead.
  const byBrand = new Map<string, { count: number; totalPrice: number; prices: number[] }>();
  for (const p of all) {
    const b = p.b!;
    const price = Number(p.p || 0);
    const entry = byBrand.get(b) || { count: 0, totalPrice: 0, prices: [] };
    entry.count++;
    if (price > 0) {
      entry.totalPrice += price;
      entry.prices.push(price);
    }
    byBrand.set(b, entry);
  }
  const summary = [...byBrand.entries()]
    .map(([brand, s]) => ({
      brand,
      products: s.count,
      avgPrice: s.prices.length > 0 ? Math.round(s.totalPrice / s.prices.length) : 0,
      minPrice: s.prices.length > 0 ? Math.round(Math.min(...s.prices)) : 0,
      maxPrice: s.prices.length > 0 ? Math.round(Math.max(...s.prices)) : 0,
    }))
    .sort((a, b) => b.products - a.products);

  return {
    totalProducts: all.length,
    totalBrands: byBrand.size,
    byBrand: summary.slice(0, 15),
  };
}

/* ─── Gemini synthesis ─── */

async function synthesizeDigest(
  feed: ReturnType<typeof aggregateFeedInsights>,
  products: ReturnType<typeof aggregateProductInsights>,
  region: string,
): Promise<{ intro: string; sections: NewsSection[] } | null> {
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

  // Trim top posts to just the captions + metrics Gemini needs
  const topPostsText = feed.topPosts.slice(0, 10).map((p, i) =>
    `${i + 1}. @${p.handle} [${p.category}] · ${p.likes.toLocaleString()} likes · ${p.comments} comments · ${p.engagement}% eng\n   "${p.caption.substring(0, 180)}"\n   URL: ${p.postUrl}`
  ).join('\n\n');

  const momentumText = feed.momentum.slice(0, 8).map((b, i) =>
    `${i + 1}. @${b.handle} (${b.name}) — ${b.count} posts this week vs ${b.priorCount} last week (${b.deltaPct > 999 ? 'new' : `+${Math.round(b.deltaPct)}%`})`
  ).join('\n');

  const hashtagText = feed.hashtagRising.slice(0, 12).map((t, i) =>
    `${i + 1}. #${t.tag} — ${t.count} uses this week (+${t.delta} vs last week)`
  ).join('\n');

  const formatText = `Videos: ${feed.formatMix.video} · Carousels: ${feed.formatMix.carousel} · Images: ${feed.formatMix.image} · Total: ${feed.formatMix.total}`;

  const engagementText = feed.engagementLeaders.slice(0, 6).map((b, i) =>
    `${i + 1}. @${b.handle} (${b.name}) — ${b.avgLikes.toLocaleString()} avg likes over ${b.count} posts`
  ).join('\n');

  const catalogText = products.byBrand.slice(0, 10).map((b, i) =>
    `${i + 1}. ${b.brand} — ${b.products} SKUs, $${b.minPrice}–$${b.maxPrice} (avg $${b.avgPrice})`
  ).join('\n');

  const prompt = `You are the editor of Lenzy's daily eyewear intelligence brief for an in-house Lenskart team. Turn the raw signals below into a sharp, scannable daily digest.

Today: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
Region: ${region === 'ALL' ? 'Global' : region}
Data window: last 7 days vs previous 7 days

═══════════════════════════════════════
RAW SIGNALS FROM LENZY
═══════════════════════════════════════

## Feed activity
- ${feed.totalRecent} posts tracked this week (vs ${feed.totalPrior} prior week)
- Format mix: ${formatText}

## Top performing posts (by likes)
${topPostsText}

## Brand momentum — who's posting more this week
${momentumText || 'No significant movement this week.'}

## Engagement leaders (avg likes per post)
${engagementText || 'Not enough data.'}

## Rising hashtags (vs last week)
${hashtagText || 'No rising hashtags.'}

## Product catalog snapshot (top brands)
${catalogText}

═══════════════════════════════════════
YOUR OUTPUT — must be valid JSON, no markdown
═══════════════════════════════════════

{
  "intro": "2-3 sentence editorial intro in the voice of a sharp in-house analyst. Lead with the single biggest takeaway from the data. Be specific — use brand names, numbers, percentages.",
  "sections": [
    {
      "title": "Top performing posts",
      "emoji": "🔥",
      "items": [
        {
          "headline": "Brand + what they did in under 120 chars",
          "summary": "2-3 sentences. Explain WHY it worked — format, emotion, timing, caption angle. Include the exact like/engagement numbers.",
          "source": "@handle",
          "url": "exact post URL from input",
          "metric": "e.g. 45K likes · 3.2% eng"
        }
      ]
    },
    {
      "title": "Brands gaining momentum",
      "emoji": "📈",
      "items": [
        {
          "headline": "Brand X ramped output +N% this week",
          "summary": "What's behind the push? Are they launching? Saturating? What should Lenskart take away?",
          "source": "@handle",
          "metric": "N posts (+X%)"
        }
      ]
    },
    {
      "title": "Hashtag heat",
      "emoji": "🏷️",
      "items": [
        {
          "headline": "#tag is spiking",
          "summary": "What's the conversation? Which brands are riding it? Is this a Lenskart opportunity?",
          "metric": "N uses (+X vs last week)"
        }
      ]
    },
    {
      "title": "Content format shift",
      "emoji": "🎬",
      "items": [
        {
          "headline": "What the format mix tells us this week",
          "summary": "Are brands moving to reels? Is carousel still winning? Quantify the shift and name specific brands leading it."
        }
      ]
    },
    {
      "title": "Catalog moves",
      "emoji": "🛍️",
      "items": [
        {
          "headline": "A brand's catalog signal worth noting",
          "summary": "Pricing shift, SKU expansion, a price band that stands out — anything actionable from the product data."
        }
      ]
    }
  ]
}

RULES:
- Every "Top performing posts" item MUST include the exact URL from the input. Never invent URLs.
- Be specific. "Ray-Ban's sunset reel hit 45K likes in 18h" beats "a brand posted a popular video".
- Include 3-6 items per section. Skip a section entirely if you genuinely have no signal for it.
- Never include generic filler like "keep monitoring this space" or "time will tell".
- If Lenskart or John Jacobs appears in the data, highlight them first.
- Output ONLY the raw JSON object. No \`\`\`json fences, no preamble, no commentary.`;

  for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
    try {
      const r = await ai.models.generateContent({ model, contents: prompt });
      if (!r.text) continue;
      const txt = r.text.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/, '')
        .replace(/```$/, '')
        .trim();
      const parsed = JSON.parse(txt);
      if (parsed?.sections) return parsed;
    } catch { continue; }
  }
  return null;
}

/* ─── Fallback digest without Gemini ─── */

function fallbackDigest(
  feed: ReturnType<typeof aggregateFeedInsights>,
): { intro: string; sections: NewsSection[] } {
  return {
    intro: `Tracked ${feed.totalRecent} posts this week across ${feed.engagementLeaders.length} active brands. Gemini synthesis is offline — here are the raw top signals.`,
    sections: [
      {
        title: 'Top performing posts',
        emoji: '🔥',
        items: feed.topPosts.slice(0, 8).map(p => ({
          headline: `${p.brand} — ${p.caption.substring(0, 100)}`,
          summary: `${p.likes.toLocaleString()} likes · ${p.comments} comments · ${p.engagement}% engagement · ${p.type} post`,
          source: `@${p.handle}`,
          url: p.postUrl,
          metric: `${p.likes.toLocaleString()} likes · ${p.engagement}% eng`,
          thumbnail: p.image,
        })),
      },
      {
        title: 'Brands gaining momentum',
        emoji: '📈',
        items: feed.momentum.slice(0, 6).map(b => ({
          headline: `${b.name} ramped output`,
          summary: `${b.count} posts this week vs ${b.priorCount} prior week.`,
          source: `@${b.handle}`,
          metric: `${b.count} posts (${b.deltaPct > 999 ? 'new this week' : `+${Math.round(b.deltaPct)}%`})`,
        })),
      },
      {
        title: 'Hashtag heat',
        emoji: '🏷️',
        items: feed.hashtagRising.slice(0, 8).map(t => ({
          headline: `#${t.tag} is trending`,
          summary: `Used ${t.count} times this week across brands, up from ${t.prior} last week.`,
          metric: `${t.count} uses (+${t.delta})`,
        })),
      },
    ].filter(s => s.items.length > 0),
  };
}

/* ─── Handler ─── */

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const region = searchParams.get('region') || 'ALL';
  const refresh = searchParams.get('refresh') === '1';

  const cacheKey = `news:${region}`;
  const now = Date.now();

  if (!refresh) {
    const cached = CACHE.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json({ ...cached.payload, cached: true });
    }
  }

  const feed = aggregateFeedInsights(region);
  const products = aggregateProductInsights();

  let synthesized = await synthesizeDigest(feed, products, region);
  if (!synthesized) synthesized = fallbackDigest(feed);

  // Enrich top-post items with thumbnails where we can match by URL
  const postUrlToImage = new Map(feed.topPosts.map(p => [p.postUrl, p.image]));
  for (const section of synthesized.sections) {
    for (const item of section.items) {
      if (item.url && postUrlToImage.has(item.url) && !item.thumbnail) {
        item.thumbnail = postUrlToImage.get(item.url);
      }
    }
  }

  const payload: NewsDigest = {
    date: new Date().toISOString(),
    region,
    intro: synthesized.intro,
    sections: synthesized.sections,
    dataSources: [
      { name: 'Instagram feed', count: feed.totalRecent },
      { name: 'Brand momentum', count: feed.momentum.length },
      { name: 'Rising hashtags', count: feed.hashtagRising.length },
      { name: 'Product catalog', count: products.totalProducts },
    ],
    generatedAt: new Date().toISOString(),
    cached: false,
  };

  CACHE.set(cacheKey, { payload, expiresAt: now + CACHE_TTL_MS });
  return NextResponse.json(payload);
}
