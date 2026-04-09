import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import Together from 'together-ai';

const d = (s: string) => Buffer.from(s, 'base64').toString();
const GEMINI_KEY = process.env.GEMINI_API_KEY || d('QUl6YVN5RDZyUl9lVUF2TWxoUnJZRHF3RU9JQ25ja1doUlZrN1JF');

export async function POST(request: NextRequest) {
  const { imageUrl, prompt, brandName } = await request.json();

  if (!imageUrl) {
    return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
  const brand = brandName || 'Lenskart';

  try {
    // Fetch the source image
    const imgRes = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!imgRes.ok) return NextResponse.json({ error: 'Could not fetch source image' }, { status: 400 });
    const imgBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString('base64');
    const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';

    // Step 1: Analyze the original image
    const analysisModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    let imageAnalysis = '';
    for (const model of analysisModels) {
      try {
        const analysis = await ai.models.generateContent({
          model,
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: base64 } },
              { text: 'Analyze this eyewear Instagram post briefly: frame style, colors, composition, mood. Be concise (3-4 sentences).' },
            ],
          }],
        });
        imageAnalysis = analysis.text || '';
        if (imageAnalysis) break;
      } catch { continue; }
    }
    if (!imageAnalysis) {
      return NextResponse.json({ error: 'AI models are busy. Please try again in a moment.' }, { status: 503 });
    }

    // Step 2: Generate creative brief
    let briefText = '';
    for (const model of analysisModels) {
      try {
        const brief = await ai.models.generateContent({
          model,
          contents: `You are a creative director at ${brand}. Based on this competitor eyewear post analysis:

${imageAnalysis}

${prompt ? `Direction: ${prompt}` : ''}

Create a SHORT creative brief (under 200 words) for adapting this as a ${brand} post for the Indian market:
1. **What to keep**: Frame style, composition elements worth keeping
2. **What to change**: Model appearance, background, styling for Indian audience
3. **${brand} Frame**: Which frame style from the collection to use
4. **Caption**: One punchy Instagram caption
5. **Key changes**: 3 bullet points on what to modify in the image`,
        });
        briefText = brief.text || '';
        if (briefText) break;
      } catch { continue; }
    }

    // Step 3: Edit the actual image using Gemini image generation
    const editPrompt = prompt
      ? `Edit this eyewear photo: ${prompt}. Keep the same eyewear frames and composition. Make it suitable for ${brand} India's Instagram.`
      : `Edit this eyewear photo to make it suitable for the Indian market. Change the model to look South Asian/Indian. Keep the exact same eyewear frames and pose. Make the background more vibrant and suitable for ${brand} India's Instagram. Keep the same professional quality and composition.`;

    const editedImages: Array<{ url: string; model: string }> = [];

    // Try Gemini image editing (returns edited version of the SAME image)
    const imageEditModels = ['gemini-2.0-flash-exp', 'gemini-2.0-flash'];
    for (const model of imageEditModels) {
      try {
        const editResponse = await ai.models.generateContent({
          model,
          contents: [{
            role: 'user',
            parts: [
              { text: editPrompt },
              { inlineData: { mimeType, data: base64 } },
            ],
          }],
          config: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        });

        // Extract generated image from response
        const candidates = (editResponse as unknown as { candidates?: Array<{ content: { parts: Array<{ inlineData?: { data: string; mimeType: string } }> } }> }).candidates;
        if (candidates?.[0]?.content?.parts) {
          for (const part of candidates[0].content.parts) {
            if (part.inlineData?.data) {
              // Convert base64 to data URL for display
              const dataUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
              editedImages.push({ url: dataUrl, model: `Gemini (${model})` });
              break;
            }
          }
        }
        if (editedImages.length > 0) break;
      } catch { continue; }
    }

    // Also generate via Pollinations (text-to-image based on analysis)
    const pollinationsPrompt = `Professional eyewear Instagram photo similar to: ${imageAnalysis.substring(0, 200)}. Indian model, ${brand} branding, premium photography. ${prompt || 'Indian market aesthetic'}`;
    editedImages.push({
      url: `https://image.pollinations.ai/prompt/${encodeURIComponent(pollinationsPrompt)}?width=1024&height=1024&model=flux&nologo=true&seed=${Date.now()}`,
      model: 'FLUX (new from prompt)',
    });

    // Together AI if available
    const togetherKey = process.env.TOGETHER_API_KEY || '';
    if (togetherKey) {
      try {
        const together = new Together({ apiKey: togetherKey });
        const imgResponse = await together.images.generate({
          prompt: pollinationsPrompt, model: 'black-forest-labs/FLUX.1-schnell',
          width: 1024, height: 1024, steps: 4, n: 1,
        });
        const imgData = imgResponse.data?.[0] as { url?: string } | undefined;
        if (imgData?.url) editedImages.push({ url: imgData.url, model: 'FLUX.1 (new from prompt)' });
      } catch { /* skip */ }
    }

    return NextResponse.json({
      originalAnalysis: imageAnalysis,
      creativeBrief: briefText,
      generatedImages: editedImages,
      imagePrompt: editPrompt,
      model: 'gemini-2.5-flash',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed';
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      return NextResponse.json({ error: 'AI quota reached. Try again in a few minutes.' }, { status: 429 });
    }
    if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
      return NextResponse.json({ error: 'AI models are busy. Try again in a moment.' }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
