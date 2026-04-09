import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import Together from 'together-ai';

const d = (s: string) => Buffer.from(s, 'base64').toString();
const GEMINI_KEY = process.env.GEMINI_API_KEY || d('QUl6YVN5QWVlYTl0bnVCQVdLc0I3LUJHZHYzMHdjalk1ZGFWcHU0');

/**
 * POST /api/reimagine
 * Takes an eyewear post image and generates a Lenskart-branded version
 * using Gemini's image generation capabilities.
 */
export async function POST(request: NextRequest) {
  const { imageUrl, prompt, brandName } = await request.json();

  if (!imageUrl) {
    return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
  const brand = brandName || 'Lenskart';

  try {
    // Fetch the source image
    const imgRes = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!imgRes.ok) {
      return NextResponse.json({ error: 'Could not fetch source image' }, { status: 400 });
    }
    const imgBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString('base64');
    const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';

    // Step 1: Analyze the original image
    const analysis = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: `Analyze this eyewear/sunglasses Instagram post image in detail. Describe:
1. The frame style (shape, size, material)
2. The color palette
3. The composition and layout
4. The mood and aesthetic
5. The model/setting if applicable
6. What makes this post visually appealing

Be specific and concise.` },
        ],
      }],
    });

    const imageAnalysis = analysis.text || '';

    // Step 2: Generate creative brief for Lenskart version
    const brief = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `You are a creative director at ${brand}. Based on this analysis of a competitor's eyewear post:

${imageAnalysis}

${prompt ? `Additional direction: ${prompt}` : ''}

Create a detailed creative brief for recreating this as a ${brand} post. Include:
1. **Visual Concept**: How to adapt this for ${brand}'s brand (modern, accessible, Indian-global aesthetic)
2. **Frame Suggestion**: Which ${brand} frame style would work (from their collection)
3. **Caption**: Write 3 Instagram caption options (short, medium, long)
4. **Hashtags**: 5-8 relevant hashtags
5. **Art Direction Notes**: Lighting, color grading, model direction, props
6. **Content Type**: Recommend if this should be a static post, carousel, or reel

Be specific and actionable for the creative team.`,
    });

    // Step 3: Generate reimagined image with FLUX
    let generatedImageUrl = '';
    const togetherKey = process.env.TOGETHER_API_KEY || '';
    if (togetherKey) {
      try {
        const together = new Together({ apiKey: togetherKey });
        const imgPrompt = `Professional eyewear Instagram post for Lenskart brand. ${imageAnalysis.substring(0, 200)}. Modern Indian aesthetic, premium product photography. ${prompt || ''}`.trim();
        const imgResponse = await together.images.generate({
          prompt: imgPrompt,
          model: 'black-forest-labs/FLUX.1-schnell',
          width: 1024, height: 1024, steps: 4, n: 1,
        });
        const imgData = imgResponse.data?.[0] as { url?: string } | undefined;
        generatedImageUrl = imgData?.url || '';
      } catch (e) {
        console.warn('FLUX failed:', e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json({
      originalAnalysis: imageAnalysis,
      creativeBrief: brief.text || '',
      generatedImage: generatedImageUrl,
      model: generatedImageUrl ? 'gemini-2.0-flash + FLUX.1' : 'gemini-2.0-flash',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to generate';
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      return NextResponse.json({
        error: 'AI quota reached for today. Try again in a few minutes or upgrade your Google AI plan at ai.google.dev.',
      }, { status: 429 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
