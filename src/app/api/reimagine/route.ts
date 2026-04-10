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
async function callReplicateSlug(modelSlug: string, input: Record<string, unknown>): Promise<{ url: string | null; error: string | null }> {
  try {
    console.log(`[Replicate ${modelSlug}] Starting with input keys:`, Object.keys(input));
    const res = await fetch(`https://api.replicate.com/v1/models/${modelSlug}/predictions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=60',
      },
      body: JSON.stringify({ input }),
    });
    console.log(`[Replicate ${modelSlug}] HTTP status:`, res.status);
    const data = await res.json();
    console.log(`[Replicate ${modelSlug}] Response:`, JSON.stringify(data).substring(0, 500));

    // Check for API errors (402 credit, 401 auth, 422 validation)
    if (!res.ok || data.detail || data.error) {
      return { url: null, error: data.title || data.detail || data.error || `HTTP ${res.status}` };
    }

    if (data.status === 'succeeded' && data.output) {
      if (Array.isArray(data.output)) return { url: String(data.output[0]), error: null };
      if (typeof data.output === 'string') return { url: data.output, error: null };
    }

    const pollUrl = data.urls?.get;
    if (!pollUrl) {
      return { url: null, error: `No poll URL in response: ${JSON.stringify(data).substring(0, 200)}` };
    }

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(pollUrl, {
        headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}` },
      });
      const pollData = await pollRes.json();

      if (pollData.status === 'succeeded' && pollData.output) {
        if (Array.isArray(pollData.output)) return { url: String(pollData.output[0]), error: null };
        if (typeof pollData.output === 'string') return { url: pollData.output, error: null };
      }
      if (pollData.status === 'failed' || pollData.status === 'canceled') {
        return { url: null, error: pollData.error || 'Prediction failed' };
      }
    }
    return { url: null, error: 'Timeout after 60s' };
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : 'Unknown error' };
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
    const kontext = kontextResult.status === 'fulfilled' ? kontextResult.value : { url: null, error: String(kontextResult.reason) };
    const schnell = schnellResult.status === 'fulfilled' ? schnellResult.value : { url: null, error: String(schnellResult.reason) };

    const editedImages: Array<{ url: string; model: string; type: 'edited' | 'generated' }> = [];

    if (kontext.url) editedImages.push({ url: kontext.url, model: 'FLUX Kontext (edited)', type: 'edited' });
    if (schnell.url) editedImages.push({ url: schnell.url, model: 'FLUX Schnell (new)', type: 'generated' });

    // If both Replicate calls failed, fall back to Pollinations (free)
    if (editedImages.length === 0) {
      const pollinationsPrompt = `Professional eyewear Instagram photo, Indian model wearing stylish sunglasses, vibrant background, ${brand} brand, fashion photography`;
      editedImages.push({
        url: `https://image.pollinations.ai/prompt/${encodeURIComponent(pollinationsPrompt)}?width=1024&height=1024&model=flux&nologo=true&seed=${Date.now()}`,
        model: 'FLUX (Pollinations fallback)',
        type: 'generated',
      });

      // Return with warning about Replicate failure
      const errorDetail = [kontext.error, schnell.error].filter(Boolean).join(' | ');
      return NextResponse.json({
        originalAnalysis: imageAnalysis,
        creativeBrief: briefText,
        generatedImages: editedImages,
        imagePrompt: editDirection,
        warning: `Replicate failed: ${errorDetail}. Using free fallback.`,
      });
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
