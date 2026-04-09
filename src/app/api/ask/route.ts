import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { ALL_POSTS, FEED_STATS } from '@/lib/feed';

const d = (s: string) => Buffer.from(s, 'base64').toString();
const GEMINI_KEY = process.env.GEMINI_API_KEY || d('QUl6YVN5RDZyUl9lVUF2TWxoUnJZRHF3RU9JQ25ja1doUlZrN1JF');

export async function POST(request: NextRequest) {
  if (!GEMINI_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });
  }

  const { question, imageUrl } = await request.json();
  if (!question) {
    return NextResponse.json({ error: 'question required' }, { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

  // Build context from our data
  const brandStats = new Map<string, { posts: number; likes: number; comments: number }>();
  ALL_POSTS.forEach(p => {
    const key = p.brand.handle;
    const s = brandStats.get(key) || { posts: 0, likes: 0, comments: 0 };
    s.posts++; s.likes += p.likes; s.comments += p.comments;
    brandStats.set(key, s);
  });

  const topBrands = [...brandStats.entries()]
    .sort((a, b) => b[1].likes - a[1].likes)
    .slice(0, 20)
    .map(([handle, s]) => `@${handle}: ${s.posts} posts, ${s.likes} total likes`);

  const topCaptions = ALL_POSTS
    .filter(p => p.likes > 0)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 10)
    .map(p => `@${p.brand.handle}: "${p.caption.substring(0, 100)}" (${p.likes} likes)`);

  const context = `You are an eyewear industry AI analyst for Lenskart. You have access to real Instagram data:

DATA SUMMARY:
- ${FEED_STATS.totalPosts} posts from ${FEED_STATS.totalBrands} eyewear brands
- Average engagement: ${FEED_STATS.avgEngagement}%
- Content mix: ${FEED_STATS.contentMix.map(c => `${c.name}: ${c.count}`).join(', ')}
- Top categories: ${FEED_STATS.byCategory.map(c => `${c.name}: ${c.count} posts`).join(', ')}
- Top regions: ${FEED_STATS.byRegion.map(r => `${r.name}: ${r.count} posts`).join(', ')}
- Top hashtags: ${FEED_STATS.topHashtags.slice(0, 10).map(h => `#${h.name}(${h.count})`).join(', ')}

TOP BRANDS BY LIKES:
${topBrands.join('\n')}

TOP PERFORMING POSTS:
${topCaptions.join('\n')}

Answer concisely and with specific data. If asked about design/style, reference actual posts and brands. Be actionable for Lenskart's merchandising and marketing teams.`;

  try {
    // If an image URL is provided, use vision model to analyze it
    if (imageUrl) {
      // Fetch the image
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) {
        return NextResponse.json({ error: 'Could not fetch image' }, { status: 400 });
      }
      const imgBuffer = await imgRes.arrayBuffer();
      const base64 = Buffer.from(imgBuffer).toString('base64');
      const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: base64 } },
              { text: `${context}\n\nAnalyze this eyewear post image. ${question}\n\nExtract: frame style (e.g. aviator, cat-eye, round, square, oversized), material (acetate, metal, titanium), colors, target demographic, mood/aesthetic, and any design details useful for product development.` },
            ],
          },
        ],
      });

      return NextResponse.json({
        answer: response.text || '',
        model: 'gemini-2.5-flash (vision)',
        hasImage: true,
      });
    }

    // Text-only question
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `${context}\n\nQuestion: ${question}`,
    });

    return NextResponse.json({
      answer: response.text || '',
      model: 'gemini-2.5-flash',
      hasImage: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI analysis failed';
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      return NextResponse.json({ error: 'AI quota reached. Try again in a few minutes.' }, { status: 429 });
    }
    if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
      return NextResponse.json({ error: 'AI models are busy. Please try again in a moment.' }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
