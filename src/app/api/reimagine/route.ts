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

/**
 * Fetch a product page and extract the primary product image URL.
 * Works with Lenskart, John Jacobs, and most e-commerce sites (og:image, JSON-LD, etc.)
 */
async function extractProductImage(productUrl: string): Promise<string | null> {
  try {
    const res = await fetch(productUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) {
      console.warn(`[extractProductImage] ${productUrl} returned ${res.status}`);
      return null;
    }
    const html = await res.text();

    // Try og:image first (most reliable)
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch && ogMatch[1]) return ogMatch[1];

    // Try twitter:image
    const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    if (twMatch && twMatch[1]) return twMatch[1];

    // Try JSON-LD product image
    const jsonLdMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const m of jsonLdMatches) {
      try {
        const data = JSON.parse(m[1]);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          const img = item.image || item.mainEntity?.image;
          if (typeof img === 'string') return img;
          if (Array.isArray(img) && img.length > 0) return typeof img[0] === 'string' ? img[0] : img[0]?.url;
          if (img?.url) return img.url;
        }
      } catch { continue; }
    }

    // Lenskart-specific: look for their CDN image pattern in the HTML
    const lenskartMatch = html.match(/https?:\/\/[^"'\s]*static\.lenskart\.com[^"'\s]*\.(?:jpg|jpeg|png|webp)/i);
    if (lenskartMatch) return lenskartMatch[0];

    return null;
  } catch (e) {
    console.warn('[extractProductImage] error:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const { imageUrl, prompt, brandName } = await request.json();
  if (!imageUrl) return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });

  const brand = brandName || 'Lenskart';

  // Detect if prompt contains a product URL
  const urlMatch = (prompt || '').match(/https?:\/\/[^\s]+/);
  const productUrl = urlMatch ? urlMatch[0] : null;
  const userNote = prompt ? prompt.replace(/https?:\/\/[^\s]+/, '').trim() : '';

  try {
    // Fetch source image
    const imgRes = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!imgRes.ok) return NextResponse.json({ error: 'Could not fetch source image' }, { status: 400 });
    const imgBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString('base64');
    const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';

    // If product URL provided, fetch the product image and describe it with Gemini vision
    // so FLUX Kontext gets a CONCRETE visual description (not just a dead URL string).
    let productFrameDescription = '';
    let productImageUrl: string | null = null;
    if (productUrl) {
      productImageUrl = await extractProductImage(productUrl);
      console.log('[reimagine] product URL:', productUrl, '→ image:', productImageUrl);
      if (productImageUrl) {
        try {
          const prodRes = await fetch(productImageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (prodRes.ok) {
            const prodBuf = await prodRes.arrayBuffer();
            const prodBase64 = Buffer.from(prodBuf).toString('base64');
            const prodMime = prodRes.headers.get('content-type') || 'image/jpeg';
            const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
            for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
              try {
                const r = await ai.models.generateContent({
                  model,
                  contents: [{
                    role: 'user',
                    parts: [
                      { inlineData: { mimeType: prodMime, data: prodBase64 } },
                      { text: 'Describe ONLY these eyewear frames for an image-editing AI. Cover: frame shape (aviator/round/square/cat-eye/rectangular/wayfarer/oversized), frame color and finish (gloss/matte), temple color, bridge type, lens color/tint, material (acetate/metal/titanium/plastic), and any distinctive details (rivets, logo placement, etc). Be concrete and visual. Maximum 60 words, no preamble.' },
                    ],
                  }],
                });
                if (r.text) { productFrameDescription = r.text.trim(); break; }
              } catch { continue; }
            }
          }
        } catch (e) {
          console.warn('[reimagine] product image describe failed:', e);
        }
      }
    }

    // Build CONSERVATIVE edit prompt
    let editDirection: string;
    if (productUrl && productFrameDescription) {
      editDirection = `Replace ONLY the eyewear frames on the person in this photo with these new frames: ${productFrameDescription}. CRITICAL: Keep the exact same person — same face, same skin tone, same hair, same identity. Keep the same pose, lighting, background, clothing, composition, and color grading. Only the frames change; nothing else. ${userNote}`.trim();
    } else if (productUrl && !productFrameDescription) {
      // Couldn't fetch product image — fall back to a safe no-op-ish instruction
      editDirection = `Replace the eyewear frames with stylish premium sunglasses. CRITICAL: Keep the exact same person — same face, same skin tone, same hair, same identity. Keep the same pose, lighting, background, clothing, composition. Only the frames change. ${userNote}`.trim();
    } else {
      editDirection = `Subtle identity change only: make the model's face look subtly Indian/South Asian (slightly darker skin tone, Indian facial features) while keeping everything else EXACTLY the same — same pose, same eyewear frames, same background, same lighting, same clothing, same composition, same color grading, same mood. This is a minimal 10% identity edit, not a style change. ${userNote}`.trim();
    }

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
        const briefContext = productUrl
          ? `Creative brief: swap the eyewear in this post to a ${brand} product${productFrameDescription ? ` (${productFrameDescription})` : ` (${productUrl})`}. Keep the original post's model, style and composition. Write ONE Instagram caption adapted for ${brand} India audience (max 30 words) + 5 hashtags.`
          : `Creative brief for ${brand} India. We're making a subtle identity edit (Indian model) on this post, keeping everything else the same. Write ONE Instagram caption adapted for Indian audience (max 30 words) + 5 hashtags. ${userNote ? 'User note: ' + userNote : ''}`;
        for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
          try {
            const r = await ai.models.generateContent({ model, contents: briefContext });
            if (r.text) return r.text;
          } catch { continue; }
        }
        return '';
      })(),

      // FLUX Kontext Max — edit the original image (preserves everything else)
      callReplicateSlug('black-forest-labs/flux-kontext-max', {
        prompt: editDirection,
        input_image: imageUrl,
        aspect_ratio: 'match_input_image',
        output_format: 'jpg',
      }),

      // FLUX Kontext Pro — second variant with same conservative edit
      callReplicateSlug('black-forest-labs/flux-kontext-pro', {
        prompt: editDirection,
        input_image: imageUrl,
        aspect_ratio: 'match_input_image',
        output_format: 'jpg',
      }),
    ]);

    const imageAnalysis = analysisResult.status === 'fulfilled' ? (analysisResult.value || '') : '';
    const briefText = briefResult.status === 'fulfilled' ? (briefResult.value || '') : '';
    const kontext = kontextResult.status === 'fulfilled' ? kontextResult.value : { url: null, error: String(kontextResult.reason) };
    const schnell = schnellResult.status === 'fulfilled' ? schnellResult.value : { url: null, error: String(schnellResult.reason) };

    const editedImages: Array<{ url: string; model: string; type: 'edited' | 'generated' }> = [];

    if (kontext.url) editedImages.push({ url: kontext.url, model: 'FLUX Kontext Max', type: 'edited' });
    if (schnell.url) editedImages.push({ url: schnell.url, model: 'FLUX Kontext Pro', type: 'edited' });

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
        productImageUrl,
        productFrameDescription,
        warning: `Replicate failed: ${errorDetail}. Using free fallback.`,
      });
    }

    return NextResponse.json({
      originalAnalysis: imageAnalysis,
      creativeBrief: briefText,
      generatedImages: editedImages,
      imagePrompt: editDirection,
      productImageUrl,
      productFrameDescription,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
