import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

/**
 * Visual Trends — Gemini Vision-powered trend extraction.
 *
 * Reads from Supabase brand_content (type=ig_post) instead of static JSON.
 * Default window widened to 30 days to capture existing data.
 *
 * Usage:
 *   GET /api/visual-trends                      (global, last 30d)
 *   GET /api/visual-trends?region=Europe
 *   GET /api/visual-trends?refresh=1             (skip cache)
 *   GET /api/visual-trends?limit=40&window=30
 */

export const maxDuration = 60;

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) throw new Error('Supabase config missing');
  return createClient(url, key);
}

/* ─── Types ─── */

interface VisualAttrs {
  shape?: string;
  color?: string;
  material?: string;
  lensType?: string;
  style?: string;
}

interface PostWithVision {
  id: string;
  brand: string;
  handle: string;
  region: string;
  category: string;
  caption: string;
  imageUrl: string;
  rawImageUrl: string;
  likes: number;
  comments: number;
  engagement: number;
  postedAt: string;
  postUrl: string;
  weight: number;
  attrs?: VisualAttrs;
}

interface RankedAttr {
  value: string;
  count: number;
  weightedCount: number;
  priorCount: number;
  delta: number;
  deltaPct: number;
  topExample?: {
    brand: string;
    handle: string;
    imageUrl: string;
    postUrl: string;
    likes: number;
  };
}

interface RegionBreakdown {
  region: string;
  totalPosts: number;
  topShapes: RankedAttr[];
  topColors: RankedAttr[];
}

interface MustDoItem {
  headline: string;
  rationale: string;
  category: 'shape' | 'color' | 'material' | 'style' | 'region' | 'format';
  urgency: 'now' | 'this-week' | 'watch';
}

interface VisualTrendsResult {
  region: string;
  window: number;
  totalAnalyzed: number;
  topShapes: RankedAttr[];
  topColors: RankedAttr[];
  topMaterials: RankedAttr[];
  topStyles: RankedAttr[];
  byRegion: RegionBreakdown[];
  mustDo: MustDoItem[];
  summary: string;
  generatedAt: string;
  cached: boolean;
}

/* ─── Cache ─── */

const VISION_CACHE = new Map<string, VisualAttrs>();
const RESULT_CACHE = new Map<string, { payload: VisualTrendsResult; expiresAt: number }>();
const RESULT_TTL_MS = 12 * 60 * 60 * 1000;

/* ─── Post selection from Supabase ─── */

async function topPostsInWindow(
  windowStartMs: number,
  windowEndMs: number,
  region: string,
  limit: number,
): Promise<PostWithVision[]> {
  const startISO = new Date(windowStartMs).toISOString();
  const endISO = new Date(windowEndMs).toISOString();

  const supabase = getSupabase();
  let query = supabase
    .from('brand_content')
    .select('id, brand_id, brand_handle, posted_at, data, blob_url')
    .eq('type', 'ig_post')
    .gte('posted_at', startISO)
    .lt('posted_at', endISO)
    .order('posted_at', { ascending: false })
    .limit(limit * 3); // fetch extra to filter

  const { data: rows, error } = await query;
  if (error || !rows) return [];

  // Get brand info for region/category filtering
  const handles = [...new Set(rows.map(r => r.brand_handle).filter(Boolean))];
  const brandMap = new Map<string, { name: string; category: string; region: string }>();

  if (handles.length > 0) {
    const { data: brands } = await getSupabase()
      .from('tracked_brands')
      .select('handle, name, category, region')
      .in('handle', handles.slice(0, 500));
    if (brands) {
      for (const b of brands) {
        brandMap.set(b.handle, {
          name: b.name || b.handle,
          category: b.category || 'Independent',
          region: b.region || 'Global',
        });
      }
    }
  }

  const regionFilter = (region === 'ALL' || !region)
    ? () => true
    : (r: string) => r.toLowerCase().includes(region.toLowerCase());

  const posts: PostWithVision[] = [];
  for (const row of rows) {
    const d = row.data || {};
    const handle = row.brand_handle || '';
    const brand = brandMap.get(handle) || { name: handle, category: 'Independent', region: 'Global' };

    if (!regionFilter(brand.region)) continue;

    const likes = Math.max(0, d.likes_count || d.likesCount || 0);
    const comments = Math.max(0, d.comments_count || d.commentsCount || 0);
    const rawUrl = row.blob_url || d.blob_url || d.display_url || d.image_url || '';
    const imageUrl = rawUrl.includes('cdninstagram.com')
      ? `/api/img?url=${encodeURIComponent(rawUrl)}`
      : rawUrl;

    if (!imageUrl) continue;

    posts.push({
      id: row.id,
      brand: brand.name,
      handle,
      region: brand.region,
      category: brand.category,
      caption: d.caption || '',
      imageUrl,
      rawImageUrl: rawUrl,
      likes,
      comments,
      engagement: likes > 0 ? parseFloat(((likes + comments) / Math.max(likes * 10, 1) * 100).toFixed(2)) : 0,
      postedAt: row.posted_at || '',
      postUrl: d.post_url || d.url || `https://www.instagram.com/p/${d.shortcode || ''}/`,
      weight: likes + comments * 5,
    });
  }

  return posts
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

/* ─── Gemini Vision batch attribute extraction ─── */

async function analyzeBatch(
  ai: GoogleGenAI,
  posts: PostWithVision[],
): Promise<void> {
  const uncached = posts.filter(p => !VISION_CACHE.has(p.id));
  if (uncached.length === 0) {
    for (const p of posts) p.attrs = VISION_CACHE.get(p.id);
    return;
  }

  const loaded = await Promise.all(uncached.map(async p => {
    try {
      const res = await fetch(p.rawImageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 4 * 1024 * 1024) return null;
      const base64 = Buffer.from(buf).toString('base64');
      const mime = res.headers.get('content-type') || 'image/jpeg';
      return { post: p, base64, mime };
    } catch { return null; }
  }));
  const valid = loaded.filter((x): x is NonNullable<typeof x> => x !== null);
  if (valid.length === 0) {
    for (const p of uncached) VISION_CACHE.set(p.id, {});
    return;
  }

  const BATCH = 8;
  for (let start = 0; start < valid.length; start += BATCH) {
    const slice = valid.slice(start, start + BATCH);
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      {
        text: `You are a senior eyewear merchandising analyst. I'm showing you ${slice.length} Instagram posts from eyewear brands, in order (image 0, 1, 2...).

For EACH image, identify the PRIMARY eyewear visible in the shot and extract its structured attributes. If no eyewear is visible in an image, return empty strings for that entry.

Return a compact JSON array (no markdown, no code fences):

[
  {"i":0,"shape":"aviator","color":"gold","material":"metal","lensType":"gradient","style":"classic"},
  {"i":1,"shape":"cat-eye","color":"tortoise","material":"acetate","lensType":"dark","style":"retro"}
]

Vocabulary (use these exact lowercase values — pick the closest match):
- shape: aviator | cat-eye | round | square | rectangle | oval | wayfarer | oversized | geometric | rimless | wrap | browline | shield
- color: black | tortoise | gold | silver | clear | brown | red | blue | white | pastel | pink | green | yellow | multicolor
- material: acetate | metal | titanium | mixed | plastic | wood | rimless
- lensType: clear | dark | mirrored | gradient | colored | polarized
- style: classic | retro | minimal | statement | sporty | luxury | streetwear | futuristic

Rules:
- One entry per image in the order shown.
- If the image has no clear eyewear (empty storefront, model without glasses, text-only graphic, etc.), return {"i":N,"shape":"","color":"","material":"","lensType":"","style":""}.
- Be decisive — pick the single best match from each vocabulary list.
- Output ONLY the raw JSON array. No preamble, no explanation.`,
      },
      ...slice.map(v => ({ inlineData: { mimeType: v.mime, data: v.base64 } })),
    ];

    for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
      try {
        const r = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
        });
        if (!r.text) continue;
        const txt = r.text.trim()
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/, '')
          .replace(/```$/, '')
          .trim();
        const arr = JSON.parse(txt) as Array<{ i: number } & VisualAttrs>;
        for (const item of arr) {
          const entry = slice[item.i];
          if (!entry) continue;
          const attrs: VisualAttrs = {
            shape: (item.shape || '').toLowerCase().trim() || undefined,
            color: (item.color || '').toLowerCase().trim() || undefined,
            material: (item.material || '').toLowerCase().trim() || undefined,
            lensType: (item.lensType || '').toLowerCase().trim() || undefined,
            style: (item.style || '').toLowerCase().trim() || undefined,
          };
          VISION_CACHE.set(entry.post.id, attrs);
        }
        break;
      } catch { continue; }
    }
  }

  for (const p of posts) p.attrs = VISION_CACHE.get(p.id) || {};
}

/* ─── Aggregation ─── */

function pickAttr(attrs: VisualAttrs | undefined, key: keyof VisualAttrs): string | undefined {
  const v = attrs?.[key];
  return v && v.length > 0 ? v : undefined;
}

function aggregate(
  posts: PostWithVision[],
  priorPosts: PostWithVision[],
  key: keyof VisualAttrs,
  topN: number,
): RankedAttr[] {
  const counts = new Map<string, { count: number; weightedCount: number; top?: PostWithVision }>();
  for (const p of posts) {
    const v = pickAttr(p.attrs, key);
    if (!v) continue;
    const entry = counts.get(v) || { count: 0, weightedCount: 0, top: undefined };
    entry.count++;
    entry.weightedCount += p.weight;
    if (!entry.top || p.weight > entry.top.weight) entry.top = p;
    counts.set(v, entry);
  }
  const priorCounts = new Map<string, number>();
  for (const p of priorPosts) {
    const v = pickAttr(p.attrs, key);
    if (!v) continue;
    priorCounts.set(v, (priorCounts.get(v) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, { count, weightedCount, top }]) => {
      const priorCount = priorCounts.get(value) || 0;
      const delta = count - priorCount;
      const deltaPct = priorCount > 0 ? Math.round((delta / priorCount) * 100) : (count > 0 ? 999 : 0);
      return {
        value,
        count,
        weightedCount,
        priorCount,
        delta,
        deltaPct,
        topExample: top ? {
          brand: top.brand,
          handle: top.handle,
          imageUrl: top.imageUrl,
          postUrl: top.postUrl,
          likes: top.likes,
        } : undefined,
      };
    })
    .sort((a, b) => b.weightedCount - a.weightedCount)
    .slice(0, topN);
}

/* ─── Weekly Must-Do synthesis ─── */

async function synthesizeMustDo(
  ai: GoogleGenAI,
  region: string,
  topShapes: RankedAttr[],
  topColors: RankedAttr[],
  topMaterials: RankedAttr[],
  topStyles: RankedAttr[],
  totalAnalyzed: number,
): Promise<{ summary: string; mustDo: MustDoItem[] } | null> {
  const formatList = (label: string, arr: RankedAttr[]) =>
    arr.length === 0 ? `${label}: (no data)` :
    `${label}:\n${arr.map((a, i) =>
      `  ${i + 1}. ${a.value} — ${a.count} posts (${a.deltaPct > 999 ? 'new' : a.delta >= 0 ? `+${Math.round(a.deltaPct)}%` : `${Math.round(a.deltaPct)}%`} vs prior period) · ${a.weightedCount.toLocaleString()} weighted engagement`
    ).join('\n')}`;

  const prompt = `You are Lenzy's resident eyewear merchandising analyst briefing the Lenskart creative + product team. Based on the Gemini Vision analysis of top-engaging eyewear posts from the last 30 days, write a sharp "Weekly Must-Do".

Region: ${region === 'ALL' ? 'Global' : region}
Posts analyzed: ${totalAnalyzed}

${formatList('SHAPES', topShapes)}

${formatList('COLORS', topColors)}

${formatList('MATERIALS', topMaterials)}

${formatList('STYLES', topStyles)}

═══════════════════════════════════════
YOUR OUTPUT — valid JSON, no markdown, no code fences.
═══════════════════════════════════════

{
  "summary": "2-3 sentences summarizing the single biggest visual shift this period. Lead with the specific shape/color/combination that moved the most. Be concrete with numbers.",
  "mustDo": [
    {
      "headline": "Action-oriented imperative under 90 chars (e.g. 'Push chrome-frame aviators into this week's top-of-feed')",
      "rationale": "1-2 sentences explaining why. Tie it to specific numbers from the data and why Lenskart should move now.",
      "category": "shape | color | material | style | region | format",
      "urgency": "now | this-week | watch"
    }
  ]
}

RULES:
- 4-6 mustDo items total. Each one must be a concrete action a merchandiser or creative lead can execute this week.
- Mix urgency levels: at least one "now" (highest confidence), two to three "this-week", at most one "watch".
- If a shape or color is declining sharply, include a "stop doing X" or "pull back on X" item.
- Never use vague phrases like "consider monitoring" or "keep an eye out". Every item is an order, not a suggestion.
- If the data shows "new" attributes (no prior-period baseline), flag them as breakout opportunities worth testing.
- Avoid jargon. Write like a sharp merchandiser, not a consultant.
- Output ONLY the raw JSON object. No preamble.`;

  for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
    try {
      const r = await ai.models.generateContent({ model, contents: prompt });
      if (!r.text) continue;
      const txt = r.text.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/, '')
        .replace(/```$/, '')
        .trim();
      const parsed = JSON.parse(txt);
      if (parsed?.mustDo) return parsed;
    } catch { continue; }
  }
  return null;
}

/* ─── Handler ─── */

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const region = searchParams.get('region') || 'ALL';
  const refresh = searchParams.get('refresh') === '1';
  const limit = Math.min(parseInt(searchParams.get('limit') || '40'), 80);
  const windowDays = Math.max(1, Math.min(parseInt(searchParams.get('window') || '30'), 90));

  const cacheKey = `trends:${region}:${limit}:${windowDays}`;
  const now = Date.now();

  if (!refresh) {
    const cached = RESULT_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json({ ...cached.payload, cached: true });
    }
  }

  const windowMs = windowDays * 86400 * 1000;
  const currentPosts = await topPostsInWindow(now - windowMs, now, region, limit);
  const priorPosts = await topPostsInWindow(now - 2 * windowMs, now - windowMs, region, limit);

  if (currentPosts.length === 0) {
    return NextResponse.json({
      region,
      window: windowDays,
      totalAnalyzed: 0,
      topShapes: [],
      topColors: [],
      topMaterials: [],
      topStyles: [],
      byRegion: [],
      mustDo: [],
      summary: `No posts found in the last ${windowDays} days for ${region === 'ALL' ? 'all regions' : region}. Try refreshing the Instagram feed or widening the window.`,
      generatedAt: new Date().toISOString(),
      cached: false,
    });
  }

  // If no Gemini key, return post counts without vision analysis
  if (!GEMINI_KEY) {
    return NextResponse.json({
      region,
      window: windowDays,
      totalAnalyzed: currentPosts.length,
      topShapes: [],
      topColors: [],
      topMaterials: [],
      topStyles: [],
      byRegion: [],
      mustDo: [],
      summary: `Found ${currentPosts.length} posts in the last ${windowDays} days from ${region === 'ALL' ? 'all regions' : region}. Gemini Vision API key not configured — set GEMINI_API_KEY to enable visual trend analysis.`,
      generatedAt: new Date().toISOString(),
      cached: false,
    });
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

  await analyzeBatch(ai, currentPosts);
  await analyzeBatch(ai, priorPosts);

  const topShapes = aggregate(currentPosts, priorPosts, 'shape', 8);
  const topColors = aggregate(currentPosts, priorPosts, 'color', 8);
  const topMaterials = aggregate(currentPosts, priorPosts, 'material', 6);
  const topStyles = aggregate(currentPosts, priorPosts, 'style', 6);

  const byRegion: RegionBreakdown[] = [];
  if (region === 'ALL') {
    const regions = Array.from(new Set(currentPosts.map(p => p.region))).filter(Boolean);
    for (const r of regions) {
      const regionCurrent = currentPosts.filter(p => p.region === r);
      const regionPrior = priorPosts.filter(p => p.region === r);
      if (regionCurrent.length < 2) continue;
      byRegion.push({
        region: r,
        totalPosts: regionCurrent.length,
        topShapes: aggregate(regionCurrent, regionPrior, 'shape', 4),
        topColors: aggregate(regionCurrent, regionPrior, 'color', 4),
      });
    }
    byRegion.sort((a, b) => b.totalPosts - a.totalPosts);
  }

  const synthesized = await synthesizeMustDo(
    ai, region, topShapes, topColors, topMaterials, topStyles, currentPosts.length,
  );

  const payload: VisualTrendsResult = {
    region,
    window: windowDays,
    totalAnalyzed: currentPosts.length,
    topShapes,
    topColors,
    topMaterials,
    topStyles,
    byRegion,
    mustDo: synthesized?.mustDo || [],
    summary: synthesized?.summary || fallbackSummary(topShapes, topColors, currentPosts.length, region),
    generatedAt: new Date().toISOString(),
    cached: false,
  };

  RESULT_CACHE.set(cacheKey, { payload, expiresAt: now + RESULT_TTL_MS });
  return NextResponse.json(payload);
}

function fallbackSummary(topShapes: RankedAttr[], topColors: RankedAttr[], total: number, region: string): string {
  const shape = topShapes[0];
  const color = topColors[0];
  if (!shape && !color) {
    return `Analyzed ${total} top-engaging posts from ${region === 'ALL' ? 'across all regions' : region} but Gemini Vision didn't return usable attributes. Try again in a few minutes.`;
  }
  const bits: string[] = [];
  if (shape) bits.push(`${shape.value} frames lead with ${shape.count} posts ${shape.delta >= 0 ? `(+${Math.round(shape.deltaPct)}%)` : `(${Math.round(shape.deltaPct)}%)`}`);
  if (color) bits.push(`${color.value} is the dominant colorway (${color.count} posts)`);
  return `${bits.join(', ')}. Scanned ${total} top posts from ${region === 'ALL' ? 'the global feed' : region}.`;
}
