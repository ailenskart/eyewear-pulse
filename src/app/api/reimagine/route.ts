import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const d = (s: string) => Buffer.from(s, 'base64').toString();
const GEMINI_KEY = process.env.GEMINI_API_KEY || d('QUl6YVN5RDZyUl9lVUF2TWxoUnJZRHF3RU9JQ25ja1doUlZrN1JF');
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || d('cjhfNFNrN2p4UFVtbTg0djhLU28wOHZiQ0dSaEdkVmpmajN1T3YzZg==');

/**
 * Call Replicate HTTP API directly — no SDK, fully in control.
 * Returns the first image URL or null.
 */
async function callReplicate(modelVersion: string, input: Record<string, unknown>): Promise<string | null> {
  try {
    // Create prediction
    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=60', // wait up to 60s for completion
      },
      body: JSON.stringify({ version: modelVersion, input }),
    });

    const data = await createRes.json();

    // If already completed (due to Prefer: wait)
    if (data.status === 'succeeded' && data.output) {
      if (Array.isArray(data.output)) return String(data.output[0]);
      if (typeof data.output === 'string') return data.output;
    }

    // Otherwise poll
    const pollUrl = data.urls?.get;
    if (!pollUrl) {
      console.warn('No poll URL:', JSON.stringify(data).substring(0, 300));
      return null;
    }

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(pollUrl, {
        headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}` },
      });
      const pollData = await pollRes.json();

      if (pollData.status === 'succeeded' && pollData.output) {
        if (Array.isArray(pollData.output)) return String(pollData.output[0]);
        if (typeof pollData.output === 'string') return pollData.output;
      }
      if (pollData.status === 'failed' || pollData.status === 'canceled') {
        console.warn('Prediction failed:', pollData.error);
        return null;
      }
    }
    return null;
  } catch (e) {
    console.warn('Replicate error:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Call Replicate using model slug (let Replicate pick latest version)
 */
async function callReplicateSlug(modelSlug: string, input: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(`https://api.replicate.com/v1/models/${modelSlug}/predictions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=60',
      },
      body: JSON.stringify({ input }),
    });
    const data = await res.json();

    if (data.status === 'succeeded' && data.output) {
      if (Array.isArray(data.output)) return String(data.output[0]);
      if (typeof data.output === 'string') return data.output;
    }

    const pollUrl = data.urls?.get;
    if (!pollUrl) {
      console.warn(`${modelSlug} no poll URL:`, JSON.stringify(data).substring(0, 300));
      return null;
    }

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(pollUrl, {
        headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}` },
      });
      const pollData = await pollRes.json();

      if (pollData.status === 'succeeded' && pollData.output) {
        if (Array.isArray(pollData.output)) return String(pollData.output[0]);
        if (typeof pollData.output === 'string') return pollData.output;
      }
      if (pollData.status === 'failed' || pollData.status === 'canceled') {
        console.warn(`${modelSlug} failed:`, pollData.error);
        return null;
      }
    }
    return null;
  } catch (e) {
    console.warn(`${modelSlug} error:`, e instanceof Error ? e.message : e);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const { imageUrl, prompt, brandName } = await request.json();
  if (!imageUrl) return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });

  const brand = brandName || 'Lenskart';
  const editDirection = prompt || `Make suitable for ${brand} India — change model to look Indian/South Asian, keep the exact same eyewear frames, make background vibrant`;

  try {
    // Fetch source image
    const imgRes = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!imgRes.ok) return NextResponse.json({ error: 'Could not fetch source image' }, { status: 400 });
    const imgBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString('base64');
    const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';

    // Run all in parallel
    const [analysisResult, briefResult, kontextResult, schnellResult] = await Promise.allSettled([
      // Gemini analysis
      (async () => {
        const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
        for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
          try {
            const r = await ai.models.generateContent({
              model, contents: [{ role: 'user', parts: [
                { inlineData: { mimeType, data: base64 } },
                { text: 'In 3 sentences: frame style, colors, mood.' },
              ]}],
            });
            if (r.text) return r.text;
          } catch { continue; }
        }
        return '';
      })(),

      // Gemini brief
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

      // FLUX Kontext — edit the original image (img2img)
      callReplicateSlug('black-forest-labs/flux-kontext-max', {
        prompt: `Edit this eyewear photo: ${editDirection}. Keep the same eyewear frames and pose. Professional Instagram quality.`,
        input_image: imageUrl,
        aspect_ratio: '1:1',
        output_format: 'jpg',
      }),

      // FLUX Schnell — fast text-to-image
      callReplicateSlug('black-forest-labs/flux-schnell', {
        prompt: `Professional eyewear Instagram photo. Indian model wearing stylish designer sunglasses, vibrant background, ${brand} brand, fashion photography`,
        aspect_ratio: '1:1',
        output_format: 'jpg',
        num_outputs: 1,
      }),
    ]);

    const imageAnalysis = analysisResult.status === 'fulfilled' ? (analysisResult.value || '') : '';
    const briefText = briefResult.status === 'fulfilled' ? (briefResult.value || '') : '';
    const kontextUrl = kontextResult.status === 'fulfilled' ? kontextResult.value : null;
    const schnellUrl = schnellResult.status === 'fulfilled' ? schnellResult.value : null;

    const editedImages: Array<{ url: string; model: string; type: 'edited' | 'generated' }> = [];

    if (kontextUrl) editedImages.push({ url: kontextUrl, model: 'FLUX Kontext (edited)', type: 'edited' });
    if (schnellUrl) editedImages.push({ url: schnellUrl, model: 'FLUX Schnell (new)', type: 'generated' });

    // Debug info if nothing worked
    if (editedImages.length === 0) {
      const debug: string[] = [];
      if (kontextResult.status === 'rejected') debug.push(`Kontext: ${kontextResult.reason}`);
      if (schnellResult.status === 'rejected') debug.push(`Schnell: ${schnellResult.reason}`);
      return NextResponse.json({
        error: `Image generation failed. ${debug.join('. ') || 'Both Replicate models returned null. Check model slugs.'}`,
        originalAnalysis: imageAnalysis,
        creativeBrief: briefText,
      }, { status: 502 });
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
