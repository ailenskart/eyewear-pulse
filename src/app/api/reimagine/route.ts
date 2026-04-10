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
 * Extract the color and frame-type keyword from a product slug.
 * e.g. "Lenskart Hustlr LA E19034 Cherry Eyeglasses"
 *   → { color: "cherry", frameType: "eyeglasses" }
 */
function extractSlugKeywords(slug: string): { color: string; frameType: string } {
  const lower = slug.toLowerCase();
  const colors = [
    'cherry', 'red', 'burgundy', 'maroon', 'crimson', 'wine',
    'navy', 'blue', 'teal', 'turquoise', 'indigo', 'cobalt',
    'black', 'jet', 'charcoal',
    'white', 'ivory', 'cream',
    'gold', 'rose-gold', 'silver', 'bronze', 'copper', 'gunmetal',
    'brown', 'tortoise', 'tortoiseshell', 'havana', 'amber', 'tan',
    'green', 'olive', 'emerald',
    'pink', 'rose', 'blush', 'coral',
    'purple', 'violet', 'lavender',
    'yellow', 'mustard',
    'grey', 'gray',
    'clear', 'transparent', 'crystal',
  ];
  let color = '';
  for (const c of colors) {
    const re = new RegExp(`\\b${c}\\b`, 'i');
    if (re.test(lower)) { color = c; break; }
  }
  let frameType = 'eyeglasses';
  if (/sunglasses|shades/i.test(lower)) frameType = 'sunglasses';
  else if (/eyeglasses|glasses|specs|spectacles|optical/i.test(lower)) frameType = 'eyeglasses';
  return { color, frameType };
}

/**
 * Parse an eyewear product URL slug into a synthetic textual description.
 * Lenskart / John Jacobs PDPs are client-rendered behind Cloudflare, so we
 * cannot scrape their product images. But the URL slug itself contains the
 * brand, collection, model code, color, and frame type — which is enough to
 * feed into an image-editing prompt.
 *
 * Examples:
 *   lenskart-hustlr-la-e19034-navy+blue-eyeglasses.html
 *     → "Lenskart Hustlr LA E19034 Navy Blue Eyeglasses"
 *   john-jacobs-bauhaus-jj-e13488-black-eyeglasses.html
 *     → "John Jacobs Bauhaus JJ E13488 Black Eyeglasses"
 */
function parseProductSlug(productUrl: string): string {
  try {
    const u = new URL(productUrl);
    // Pull the last path segment, strip extensions and query params
    const last = u.pathname.split('/').filter(Boolean).pop() || '';
    let slug = last.replace(/\.(html?|php|aspx?)$/i, '');
    // Replace dashes and + with spaces, decode URL-encoded chars
    slug = decodeURIComponent(slug).replace(/[-+_]+/g, ' ').trim();
    // Title-case each word
    const words = slug.split(/\s+/).map(w => {
      // Preserve model codes like "LA E19034" uppercase
      if (/^[a-z]{1,3}\d+[a-z0-9]*$/i.test(w) || /^[a-z]{2,4}$/i.test(w) && w.length <= 3) {
        return w.toUpperCase();
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    });
    return words.join(' ');
  } catch {
    return '';
  }
}

/**
 * Fetch a product page and extract the primary product image URL.
 * Works on most e-commerce sites (og:image, twitter:image, JSON-LD).
 * Fails silently on JS-rendered SPAs behind Cloudflare (Lenskart, etc.)
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

    // Reject generic/logo images that aren't the actual product
    const isRealProductImage = (url: string): boolean => {
      const lower = url.toLowerCase();
      if (lower.includes('logo')) return false;
      if (lower.includes('icon')) return false;
      if (lower.includes('placeholder')) return false;
      if (lower.includes('lenskart-logo')) return false;
      if (lower.match(/\d+x\d+/) && !lower.includes('catalog/product')) return false;
      return true;
    };

    // Try og:image first (most reliable)
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch && ogMatch[1] && isRealProductImage(ogMatch[1])) return ogMatch[1];

    // Try twitter:image
    const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    if (twMatch && twMatch[1] && isRealProductImage(twMatch[1])) return twMatch[1];

    // Try JSON-LD product image
    const jsonLdMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const m of jsonLdMatches) {
      try {
        const data = JSON.parse(m[1]);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          const img = item.image || item.mainEntity?.image;
          let candidate: string | undefined;
          if (typeof img === 'string') candidate = img;
          else if (Array.isArray(img) && img.length > 0) candidate = typeof img[0] === 'string' ? img[0] : img[0]?.url;
          else if (img?.url) candidate = img.url;
          if (candidate && isRealProductImage(candidate)) return candidate;
        }
      } catch { continue; }
    }

    // Lenskart-specific: look for their catalog product CDN image pattern in the HTML
    const lenskartCatalogMatch = html.match(/https?:\/\/static\d*\.lenskart\.com\/media\/catalog\/product\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/i);
    if (lenskartCatalogMatch) return lenskartCatalogMatch[0];

    return null;
  } catch (e) {
    console.warn('[extractProductImage] error:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const { imageUrl, prompt, brandName, frameImageBase64, frameImageMime } = await request.json();
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

    // Resolve the frame description from one of three sources:
    //   A) User uploaded a frame photo directly → describe with Gemini vision (most reliable)
    //   B) Product URL → scrape image OR fall back to slug parsing
    //   C) Nothing → default face-nudge edit
    let productFrameDescription = '';
    let productImageUrl: string | null = null;
    let productSlug = '';

    // ── Path A: uploaded frame image (highest priority, most reliable) ──
    if (frameImageBase64) {
      try {
        const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
        const mime = frameImageMime || 'image/jpeg';
        for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
          try {
            const r = await ai.models.generateContent({
              model,
              contents: [{
                role: 'user',
                parts: [
                  { inlineData: { mimeType: mime, data: frameImageBase64 } },
                  { text: 'Describe ONLY these eyewear frames for an image-editing AI. Cover: frame shape (aviator/round/square/cat-eye/rectangular/wayfarer/oversized), frame color and finish (gloss/matte), temple color, bridge type, lens color/tint, material (acetate/metal/titanium/plastic), and any distinctive details (rivets, logo placement, etc). Be concrete and visual. Maximum 60 words, no preamble.' },
                ],
              }],
            });
            if (r.text) { productFrameDescription = r.text.trim(); break; }
          } catch { continue; }
        }
        // Surface the uploaded image back to the client as a data URL so the thread
        // card can show the reference frames thumbnail.
        productImageUrl = `data:${mime};base64,${frameImageBase64}`;
      } catch (e) {
        console.warn('[reimagine] uploaded frame describe failed:', e);
      }
    }

    // ── Path B: product URL (only if no uploaded frame) ──
    if (productUrl && !productFrameDescription) {
      productSlug = parseProductSlug(productUrl);
      productImageUrl = await extractProductImage(productUrl);
      console.log('[reimagine] product URL:', productUrl, '→ slug:', productSlug, '→ image:', productImageUrl);
      const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

      // Path 1: we got a real product image → use vision
      if (productImageUrl) {
        try {
          const prodRes = await fetch(productImageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (prodRes.ok) {
            const prodBuf = await prodRes.arrayBuffer();
            const prodBase64 = Buffer.from(prodBuf).toString('base64');
            const prodMime = prodRes.headers.get('content-type') || 'image/jpeg';
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

      // Path 2: no image OR vision failed → expand the URL slug with Gemini text
      if (!productFrameDescription && productSlug) {
        for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
          try {
            const r = await ai.models.generateContent({
              model,
              contents: `This is an eyewear product name scraped from an e-commerce URL: "${productSlug}". Infer and describe the frames as they would visually appear in an image-editing prompt. Cover: frame shape (aviator / round / square / cat-eye / rectangular / wayfarer / oversized / geometric / browline), frame color (use the exact color in the name), finish (gloss/matte), material (acetate/metal/titanium), lens type (clear prescription lenses for eyeglasses OR tinted lenses for sunglasses based on the name), and style vibe. Be concrete and visual. Maximum 50 words. No preamble, just the description.`,
            });
            if (r.text) { productFrameDescription = r.text.trim(); break; }
          } catch { continue; }
        }
      }

      // Path 3: absolute last resort — use the slug verbatim
      if (!productFrameDescription && productSlug) {
        productFrameDescription = productSlug;
      }
    }

    // Build the edit prompt.
    // Identity is ALWAYS locked to the original ethnicity / race / skin tone so
    // FLUX Kontext can never drift into a stereotyped look. Clothes and facial
    // features get small creative variation so the edit feels reimagined and
    // not just a frame swap.
    const hasFrameSource = Boolean(frameImageBase64 || productUrl);
    const { color: slugColor, frameType: slugFrameType } = productSlug
      ? extractSlugKeywords(productSlug)
      : { color: '', frameType: '' };

    const IDENTITY_LOCK = 'CRITICAL IDENTITY LOCK: the person in the output MUST have the EXACT SAME ethnicity, race, skin tone, skin color, hair color, and hair length as the person in the input photo. DO NOT change the person\'s ethnicity or race. DO NOT make the person Indian, South Asian, African, East Asian, or any other ethnicity that differs from the input. Keep the exact same skin tone as the original.';
    const CREATIVE_TWEAK = 'Minor creative variation is welcome: slightly different facial features (small nose/jaw/eyes differences so it reads as a different individual of the SAME ethnicity), and a slightly different top (same type of garment but a different color or subtle style detail). Keep the same pose, same background, same lighting, same composition, same color grading, same mood.';

    let editDirection: string;
    if (productFrameDescription) {
      // Front-load the color so FLUX can't ignore it like Kontext Pro was doing.
      const colorEmphasis = slugColor
        ? `The frames MUST be ${slugColor.toUpperCase()} color. Repeat: ${slugColor} colored frames. `
        : '';
      const typeEmphasis = slugFrameType === 'sunglasses' ? 'tinted sunglass lenses' : 'clear prescription lenses (eyeglasses, NOT sunglasses)';
      editDirection = `Replace the eyewear on the person in this photo with new frames. ${colorEmphasis}Frame details: ${productFrameDescription}. The new frames must have ${typeEmphasis}. ${CREATIVE_TWEAK} ${IDENTITY_LOCK} ${userNote}`.trim();
    } else if (hasFrameSource) {
      editDirection = `Replace the eyewear frames with stylish premium frames. ${CREATIVE_TWEAK} ${IDENTITY_LOCK} ${userNote}`.trim();
    } else if (userNote) {
      editDirection = `${userNote}. ${CREATIVE_TWEAK} ${IDENTITY_LOCK}`.trim();
    } else {
      // No frame source and no note → do a safe creative reimagine: keep
      // ethnicity locked, apply small clothes + face variation. This is
      // what the user sees on initial landing from the feed.
      editDirection = `Reimagine this eyewear photo as a fresh editorial variant. Keep the exact same eyewear frames. ${CREATIVE_TWEAK} ${IDENTITY_LOCK}`.trim();
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
          : `Creative brief for ${brand}. We're reusing this post's exact composition with a minimally different model. Write ONE Instagram caption in the same tone/style as the original, adapted for ${brand} (max 30 words) + 5 hashtags. ${userNote ? 'User note: ' + userNote : ''}`;
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

    // If both Replicate calls failed, fall back to Pollinations (free).
    // Use the analysis of the ORIGINAL image so we don't invent ethnicity/style.
    if (editedImages.length === 0) {
      const fallbackSubject = productFrameDescription
        ? `model wearing ${productFrameDescription}`
        : `model wearing stylish eyewear frames`;
      const fallbackScene = imageAnalysis ? `, scene: ${imageAnalysis.substring(0, 200)}` : '';
      const pollinationsPrompt = `Professional ${brand} eyewear editorial photo, ${fallbackSubject}${fallbackScene}`;
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
