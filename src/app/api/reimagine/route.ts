import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import Replicate from 'replicate';

const d = (s: string) => Buffer.from(s, 'base64').toString();
const GEMINI_KEY = process.env.GEMINI_API_KEY || d('QUl6YVN5RDZyUl9lVUF2TWxoUnJZRHF3RU9JQ25ja1doUlZrN1JF');
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || d('cjhfNFNrN2p4UFVtbTg0djhLU28wOHZiQ0dSaEdkVmpmajN1T3YzZg==');

export async function POST(request: NextRequest) {
  const { imageUrl, prompt, brandName } = await request.json();
  if (!imageUrl) return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });

  const brand = brandName || 'Lenskart';
  const editDirection = prompt || `Make this suitable for ${brand} India — change model to look Indian/South Asian, keep exact same eyewear frames and pose, make background vibrant for Indian Instagram audience`;

  try {
    // Fetch source image
    const imgRes = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!imgRes.ok) return NextResponse.json({ error: 'Could not fetch source image' }, { status: 400 });
    const imgBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString('base64');
    const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
    const dataUri = `data:${mimeType};base64,${base64}`;

    // Run ALL tasks in parallel — don't let Gemini block Replicate
    const [analysisResult, briefResult, kontextResult, schnellResult] = await Promise.allSettled([
      // Task 1: Gemini image analysis
      (async () => {
        const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
        for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
          try {
            const r = await ai.models.generateContent({
              model, contents: [{ role: 'user', parts: [
                { inlineData: { mimeType, data: base64 } },
                { text: 'In 3 sentences: what eyewear frame style, what colors, what mood/setting.' },
              ]}],
            });
            if (r.text) return r.text;
          } catch { continue; }
        }
        return '';
      })(),

      // Task 2: Gemini creative brief
      (async () => {
        const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
        for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
          try {
            const r = await ai.models.generateContent({
              model, contents: `Creative director at ${brand}. Direction: ${editDirection}\nWrite a SHORT brief (under 100 words): what to keep, what to change for Indian market, one Instagram caption, 5 hashtags.`,
            });
            if (r.text) return r.text;
          } catch { continue; }
        }
        return '';
      })(),

      // Task 3: Replicate FLUX Kontext — EDIT the actual image
      (async () => {
        if (!REPLICATE_TOKEN) return null;
        const replicate = new Replicate({ auth: REPLICATE_TOKEN });
        const output = await replicate.run('black-forest-labs/flux-kontext-max', {
          input: {
            prompt: `Edit this eyewear photo: ${editDirection}. Keep the same eyewear frames. Professional Instagram quality.`,
            image: dataUri,
            aspect_ratio: '1:1',
          },
        });
        if (output && typeof output === 'object' && 'url' in (output as object)) {
          return (output as { url: () => string }).url();
        }
        return Array.isArray(output) ? String(output[0]) : typeof output === 'string' ? output : null;
      })(),

      // Task 4: Replicate FLUX Schnell — generate new
      (async () => {
        if (!REPLICATE_TOKEN) return null;
        const replicate = new Replicate({ auth: REPLICATE_TOKEN });
        const output = await replicate.run('black-forest-labs/flux-schnell', {
          input: {
            prompt: `Professional eyewear Instagram post for ${brand}. Indian model wearing stylish frames. Premium photography, vibrant background. ${editDirection}`,
            aspect_ratio: '1:1',
          },
        });
        if (output && typeof output === 'object' && 'url' in (output as object)) {
          return (output as { url: () => string }).url();
        }
        return Array.isArray(output) ? String(output[0]) : typeof output === 'string' ? output : null;
      })(),
    ]);

    const imageAnalysis = analysisResult.status === 'fulfilled' ? (analysisResult.value || '') : '';
    const briefText = briefResult.status === 'fulfilled' ? (briefResult.value || '') : '';

    const editedImages: Array<{ url: string; model: string; type: 'edited' | 'generated' }> = [];

    // Add Kontext result (edited original)
    if (kontextResult.status === 'fulfilled' && kontextResult.value) {
      editedImages.push({ url: String(kontextResult.value), model: 'FLUX Kontext (edited)', type: 'edited' });
    }

    // Add Schnell result (new generation)
    if (schnellResult.status === 'fulfilled' && schnellResult.value) {
      editedImages.push({ url: String(schnellResult.value), model: 'FLUX Schnell (new)', type: 'generated' });
    }

    // Pollinations fallback (always works, free)
    const fallback = `Professional eyewear photo. Indian model, ${brand}. ${editDirection}`;
    editedImages.push({
      url: `https://image.pollinations.ai/prompt/${encodeURIComponent(fallback)}?width=1024&height=1024&model=flux&nologo=true&seed=${Date.now()}`,
      model: 'FLUX (text-to-image)', type: 'generated',
    });

    // If we got nothing at all (no analysis, no brief, no images), report error
    if (!imageAnalysis && !briefText && editedImages.length <= 1) {
      const errors = [];
      if (kontextResult.status === 'rejected') errors.push(`Kontext: ${kontextResult.reason}`);
      if (schnellResult.status === 'rejected') errors.push(`Schnell: ${schnellResult.reason}`);
      return NextResponse.json({
        error: `AI services failed. ${errors.join('. ')}. Only fallback image available.`,
        generatedImages: editedImages,
      }, { status: 503 });
    }

    return NextResponse.json({
      originalAnalysis: imageAnalysis,
      creativeBrief: briefText,
      generatedImages: editedImages,
      imagePrompt: editDirection,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
