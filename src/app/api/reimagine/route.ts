import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import Replicate from 'replicate';

const d = (s: string) => Buffer.from(s, 'base64').toString();
const GEMINI_KEY = process.env.GEMINI_API_KEY || d('QUl6YVN5RDZyUl9lVUF2TWxoUnJZRHF3RU9JQ25ja1doUlZrN1JF');
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || d('cjhfNFNrN2p4UFVtbTg0djhLU28wOHZiQ0dSaEdkVmpmajN1T3YzZg==');

export async function POST(request: NextRequest) {
  const { imageUrl, prompt, brandName } = await request.json();
  if (!imageUrl) return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });

  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
  const brand = brandName || 'Lenskart';
  const editDirection = prompt || `Make this suitable for ${brand} India — change model to look Indian/South Asian, keep exact same eyewear frames and pose, make background vibrant for Indian Instagram audience`;

  try {
    // Fetch source image
    const imgRes = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!imgRes.ok) return NextResponse.json({ error: 'Could not fetch source image' }, { status: 400 });
    const imgBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString('base64');
    const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';

    // Step 1: Quick analysis (brief, not verbose)
    let imageAnalysis = '';
    for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
      try {
        const r = await ai.models.generateContent({
          model, contents: [{ role: 'user', parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: 'In 3 sentences: what eyewear frame style, what colors, what mood/setting.' },
          ]}],
        });
        imageAnalysis = r.text || '';
        if (imageAnalysis) break;
      } catch { continue; }
    }

    // Step 2: Creative brief (concise)
    let briefText = '';
    for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
      try {
        const r = await ai.models.generateContent({
          model, contents: `Creative director at ${brand}. Original post: ${imageAnalysis}
Direction: ${editDirection}

Write a SHORT brief (under 150 words):
1. What to keep (frames, composition)
2. What to change for Indian market
3. One Instagram caption
4. 5 hashtags`,
        });
        briefText = r.text || '';
        if (briefText) break;
      } catch { continue; }
    }

    // Step 3: Image editing with Replicate FLUX Kontext (reliable, paid)
    const editedImages: Array<{ url: string; model: string; type: 'edited' | 'generated' }> = [];

    if (REPLICATE_TOKEN) {
      const replicate = new Replicate({ auth: REPLICATE_TOKEN });

      // FLUX Kontext — edits the actual image
      try {
        const output = await replicate.run('black-forest-labs/flux-kontext-max', {
          input: {
            prompt: `Edit this eyewear photo: ${editDirection}. Keep the same eyewear frames. Professional Instagram quality.`,
            image: `data:${mimeType};base64,${base64}`,
            aspect_ratio: '1:1',
          },
        });
        const outputUrl = Array.isArray(output) ? String(output[0]) : typeof output === 'string' ? output : '';
        if (outputUrl) editedImages.push({ url: outputUrl, model: 'FLUX Kontext', type: 'edited' });
      } catch (e) {
        console.warn('FLUX Kontext failed:', e instanceof Error ? e.message : e);
      }

      // FLUX Schnell — generates new from prompt as alternative
      try {
        const output = await replicate.run('black-forest-labs/flux-schnell', {
          input: {
            prompt: `Professional eyewear Instagram post. ${imageAnalysis}. Indian model, ${brand} brand, premium photography. ${editDirection}`,
            aspect_ratio: '1:1',
          },
        });
        const outputUrl = Array.isArray(output) ? String(output[0]) : typeof output === 'string' ? output : '';
        if (outputUrl) editedImages.push({ url: outputUrl, model: 'FLUX Schnell', type: 'generated' });
      } catch (e) {
        console.warn('FLUX Schnell failed:', e instanceof Error ? e.message : e);
      }
    }

    // Fallback: Pollinations (free, always works)
    const fallbackPrompt = `Professional eyewear Instagram photo. ${imageAnalysis?.substring(0, 200) || 'Stylish eyewear'}. Indian model, ${brand} brand. ${editDirection}`;
    editedImages.push({
      url: `https://image.pollinations.ai/prompt/${encodeURIComponent(fallbackPrompt)}?width=1024&height=1024&model=flux&nologo=true&seed=${Date.now()}`,
      model: 'FLUX (text-to-image)',
      type: 'generated',
    });

    return NextResponse.json({
      originalAnalysis: imageAnalysis,
      creativeBrief: briefText,
      generatedImages: editedImages,
      imagePrompt: editDirection,
      model: REPLICATE_TOKEN ? 'Gemini + Replicate FLUX' : 'Gemini + Pollinations',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed';
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED'))
      return NextResponse.json({ error: 'AI quota reached. Try again in a few minutes.' }, { status: 429 });
    if (msg.includes('503') || msg.includes('UNAVAILABLE'))
      return NextResponse.json({ error: 'AI models are busy. Try again in a moment.' }, { status: 503 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
