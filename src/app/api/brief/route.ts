import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

/**
 * AI Creative Brief generator.
 * Input: a single post image + caption, OR a board (list of posts).
 * Output: structured creative brief — audience, hooks, visuals,
 * CTAs, variations — as markdown.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    imageUrl,
    caption,
    brand,
    boardTitle,
    items, // Array<{ imageUrl, caption, brand, type }> when briefing a board
    angle, // optional user-supplied angle/focus
    targetBrand, // e.g. "Lenskart" — who the brief is for
  } = body;

  const forBrand = targetBrand || 'Lenskart';

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

    // Single-post brief with vision
    if (imageUrl && !items) {
      const imgRes = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!imgRes.ok) return NextResponse.json({ error: 'Could not fetch source image' }, { status: 400 });
      const buf = await imgRes.arrayBuffer();
      const base64 = Buffer.from(buf).toString('base64');
      const mime = imgRes.headers.get('content-type') || 'image/jpeg';

      const prompt = `You are a senior creative strategist at ${forBrand}, an eyewear brand. Analyse this Instagram post from a competitor and write a full creative brief for a version we can run ourselves.

Source context:
- Brand: ${brand || 'unknown competitor'}
- Caption: "${caption || ''}"
${angle ? `- User angle: ${angle}` : ''}

Produce a complete brief in markdown with these exact sections:

## Hook
One-sentence emotional hook that would stop a scroll. Make it specific, not generic.

## Target audience
Primary persona (age, income, lifestyle, psychographic). Be concrete.

## Key message
The single thing the viewer should remember. Max 12 words.

## Visual direction
- Frame style (specific: aviator / round / wayfarer / etc)
- Model/talent brief (ethnicity should match the original post — we preserve identity)
- Setting, lighting, color grade
- Props and wardrobe
- Shot list (3-5 shots: hero, lifestyle, product close-up, etc)

## Caption options
Three Instagram captions in the ${forBrand} tone (max 25 words each + 4 hashtags).

## CTAs
Three calls to action optimised for conversion.

## Variations to test
Four creative variations a marketer could A/B test (different hooks, different visual angles, different audiences).

## Production notes
Any technical notes — aspect ratio, duration if video, must-have logo placement, legal claims to avoid.

Be concrete, specific, and actionable. No fluff. No "consider" language — make decisions.`;

      for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
        try {
          const r = await ai.models.generateContent({
            model,
            contents: [{
              role: 'user',
              parts: [
                { inlineData: { mimeType: mime, data: base64 } },
                { text: prompt },
              ],
            }],
          });
          if (r.text) return NextResponse.json({ brief: r.text, model });
        } catch { continue; }
      }
      return NextResponse.json({ error: 'All Gemini models failed' }, { status: 503 });
    }

    // Board brief (multi-post synthesis, text only)
    if (items && Array.isArray(items) && items.length > 0) {
      const itemsText = items.slice(0, 20).map((it: { brand?: string; caption?: string; type?: string }, i: number) =>
        `${i + 1}. @${it.brand || '?'}${it.type ? ` [${it.type}]` : ''}: "${(it.caption || '').substring(0, 140)}"`
      ).join('\n');

      const prompt = `You are a senior creative strategist at ${forBrand}, an eyewear brand. A marketer has curated a board titled "${boardTitle || 'Inspiration'}" with the following competitor posts/products. Synthesise what's working across the board and write a creative brief for a campaign ${forBrand} can run.

Board items (${items.length}):
${itemsText}

${angle ? `User angle: ${angle}\n` : ''}
Produce a complete brief in markdown with these sections:

## Pattern recognition
What visual, emotional, or messaging pattern unites these items? What's the common thread the marketer is picking up on?

## Campaign concept
One-sentence big idea for a ${forBrand} campaign that plays into that pattern.

## Target audience
Primary persona. Be specific.

## Key message
Max 12 words.

## Creative territory
- Visual style and tone
- Frame style to feature
- Model/talent direction
- Setting, lighting, color grade

## Asset list
List 6-10 specific assets to produce (e.g. "hero carousel, 3:4", "30s reel with hook at 2s", "UGC-style selfie post", etc).

## Caption starter pack
5 Instagram captions in the ${forBrand} tone (max 25 words + 4 hashtags each).

## KPIs
3 metrics this campaign should move (with a reasonable target for each).

## Risks
2-3 things that could make this campaign flop, and how to mitigate each.

Be concrete, specific, and actionable. No fluff.`;

      for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
        try {
          const r = await ai.models.generateContent({ model, contents: prompt });
          if (r.text) return NextResponse.json({ brief: r.text, model });
        } catch { continue; }
      }
      return NextResponse.json({ error: 'All Gemini models failed' }, { status: 503 });
    }

    return NextResponse.json({ error: 'Either imageUrl or items required' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Brief generation failed' }, { status: 500 });
  }
}
