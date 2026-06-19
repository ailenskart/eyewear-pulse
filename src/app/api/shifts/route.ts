import { NextRequest } from 'next/server';
import { withHandler, ok, validateQuery } from '@/lib/api';
import { supabaseServer } from '@/lib/supabase';
import { env, hasEnv } from '@/lib/env';
import { extractFrameAttrs, type ImageRef } from '@/lib/vision-attrs';
import {
  rankPickingUp, rankLaunching, deriveAttrsFromText,
  type FrameAttrs, type PostSignal, type ProductSignal,
  type PickingUpShift, type LaunchingShift,
} from '@/lib/shifts';
import { z } from 'zod';

/**
 * GET /api/shifts — concrete trend shifts, not generic eyewear.
 *
 *   ?window=30        days per period (current vs prior)
 *   ?region=Europe    optional region filter for the picking-up lane
 *   ?minAdopters=3    distinct IG accounts required for a picking-up shift
 *   ?minBrands=3      distinct brands required for a launching shift
 *   ?scan=48          max NEW images to send to Vision this request
 *   ?refresh=1        bypass the result cache
 *
 * Windows are measured back from the freshest post we hold (not wall-clock
 * now) so the surface stays meaningful against the data we actually have.
 * Vision attributes are persisted to brand_content.data.vision, so the
 * lane sharpens — and gets cheaper — every time it's loaded.
 */

export const maxDuration = 60;

const QuerySchema = z.object({
  window: z.coerce.number().int().min(1).max(120).optional(),
  region: z.string().optional(),
  minAdopters: z.coerce.number().int().min(2).max(20).optional(),
  minBrands: z.coerce.number().int().min(2).max(20).optional(),
  scan: z.coerce.number().int().min(0).max(120).optional(),
  refresh: z.coerce.number().optional(),
});

interface ShiftsResult {
  refDate: string;
  window: number;
  region: string;
  pickingUp: PickingUpShift[];
  launching: LaunchingShift[];
  summary: string;
  meta: {
    postsCurrent: number;
    postsPrior: number;
    visionAnalyzed: number;
    visionPending: number;
    productsScanned: number;
    visionEnabled: boolean;
  };
  generatedAt: string;
  cached: boolean;
}

const RESULT_CACHE = new Map<string, { payload: ShiftsResult; expiresAt: number }>();
const TTL_MS = 6 * 60 * 60 * 1000;

const DAY = 86400 * 1000;

function proxy(url: string | null | undefined): string {
  if (!url) return '';
  return url.includes('cdninstagram.com') ? `/api/img?url=${encodeURIComponent(url)}` : url;
}

/* ─── IG post fetch ─── */

interface PostRow {
  id: number;
  brand_handle: string | null;
  brand_id: number | null;
  posted_at: string | null;
  likes: number | null;
  comments: number | null;
  image_url: string | null;
  blob_url: string | null;
  url: string | null;
  data: Record<string, unknown> | null;
}

async function fetchPosts(startISO: string, endISO: string): Promise<PostRow[]> {
  const client = supabaseServer();
  const { data, error } = await client
    .from('brand_content')
    .select('id, brand_handle, brand_id, posted_at, likes, comments, image_url, blob_url, url, data')
    .eq('type', 'ig_post')
    .gte('posted_at', startISO)
    .lt('posted_at', endISO)
    .order('posted_at', { ascending: false })
    .limit(2000);
  if (error || !data) return [];
  return data as unknown as PostRow[];
}

async function maxPostedAt(): Promise<number> {
  const client = supabaseServer();
  const { data } = await client
    .from('brand_content')
    .select('posted_at')
    .eq('type', 'ig_post')
    .not('posted_at', 'is', null)
    .order('posted_at', { ascending: false })
    .limit(1);
  const ts = data?.[0]?.posted_at;
  return ts ? new Date(ts).getTime() : Date.now();
}

function rowVision(row: PostRow): FrameAttrs | undefined {
  const v = row.data?.vision;
  return v && typeof v === 'object' ? (v as FrameAttrs) : undefined;
}

function fetchableImage(row: PostRow): string {
  // blob is permanent; raw IG CDN sometimes still fetchable server-side.
  return row.blob_url || (row.data?.display_url as string) || row.image_url || '';
}

function toPostSignal(row: PostRow, attrs: FrameAttrs | undefined, brandName: string): PostSignal {
  const likes = Math.max(0, Number(row.likes) || 0);
  const comments = Math.max(0, Number(row.comments) || 0);
  const raw = fetchableImage(row);
  return {
    id: String(row.id),
    account: row.brand_handle || 'unknown',
    accountName: brandName,
    attrs,
    weight: likes + comments * 5,
    likes,
    imageUrl: proxy(raw),
    postUrl: row.url || (row.data?.post_url as string) || '',
  };
}

/* ─── Product fetch (paginated) ─── */

interface ProductRow {
  id: number;
  brand_handle: string | null;
  title: string | null;
  price: number | null;
  currency: string | null;
  product_type: string | null;
  image_url: string | null;
  blob_url: string | null;
  url: string | null;
  tags: string[] | null;
  data: Record<string, unknown> | null;
}

async function fetchProducts(cap = 5000): Promise<ProductRow[]> {
  const client = supabaseServer();
  const out: ProductRow[] = [];
  const PAGE = 1000;
  for (let from = 0; from < cap; from += PAGE) {
    const { data, error } = await client
      .from('brand_content')
      .select('id, brand_handle, title, price, currency, product_type, image_url, blob_url, url, tags, data')
      .eq('type', 'product')
      .order('id', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    out.push(...(data as unknown as ProductRow[]));
    if (data.length < PAGE) break;
  }
  return out;
}

function toProductSignal(row: ProductRow): ProductSignal {
  const d = row.data || {};
  const title = row.title || (d.product_title as string) || '';
  const attrs = deriveAttrsFromText(title, row.product_type, (row.tags || []).join(' '));
  const firstSeen = d.first_seen_at as string | undefined;
  const raw = row.blob_url || row.image_url || (d.product_image as string) || '';
  return {
    id: String(row.id),
    brand: row.brand_handle || 'unknown',
    brandName: (d.brand_display as string) || row.brand_handle || 'unknown',
    attrs,
    firstSeenMs: firstSeen ? new Date(firstSeen).getTime() : null,
    price: row.price ?? (d.product_price as number) ?? null,
    currency: row.currency || (d.product_currency as string) || null,
    imageUrl: proxy(raw),
    url: row.url || '',
    title,
  };
}

/* ─── Brand metadata (name + region) ─── */

async function brandMeta(handles: string[]): Promise<Map<string, { name: string; region: string }>> {
  const map = new Map<string, { name: string; region: string }>();
  if (handles.length === 0) return map;
  const client = supabaseServer();
  for (let i = 0; i < handles.length; i += 500) {
    const { data } = await client
      .from('tracked_brands')
      .select('handle, name, region')
      .in('handle', handles.slice(i, i + 500));
    for (const b of (data || []) as Array<{ handle: string; name: string; region: string }>) {
      map.set(b.handle, { name: b.name || b.handle, region: b.region || 'Global' });
    }
  }
  return map;
}

/* ─── Vision backfill: extract + persist for posts missing data.vision ─── */

async function ensureVision(rows: PostRow[], scanCap: number): Promise<{ analyzed: number; pending: number }> {
  const missing = rows.filter(r => rowVision(r) === undefined && fetchableImage(r));
  if (missing.length === 0 || scanCap === 0 || !hasEnv('GEMINI_API_KEY')) {
    return { analyzed: 0, pending: missing.length };
  }
  const batch = missing.slice(0, scanCap);
  const refs: ImageRef[] = batch.map(r => ({ id: String(r.id), url: fetchableImage(r) }));
  const attrsById = await extractFrameAttrs(env.GEMINI_API_KEY(), refs);

  const client = supabaseServer();
  await Promise.all(batch.map(async row => {
    const attrs = attrsById.get(String(row.id)) || {};
    const mergedData = { ...(row.data || {}), vision: attrs };
    row.data = mergedData; // reflect locally so this request can rank it
    await client.from('brand_content').update({ data: mergedData }).eq('id', row.id);
  }));

  return { analyzed: batch.length, pending: missing.length - batch.length };
}

/* ─── Summary (deterministic, no extra API cost) ─── */

function buildSummary(pick: PickingUpShift[], launch: LaunchingShift[], visionEnabled: boolean): string {
  if (pick.length === 0 && launch.length === 0) {
    return visionEnabled
      ? 'No clear trend shifts in this window yet — reload to let Vision scan more posts, or widen the window.'
      : 'Vision is off (set GEMINI_API_KEY) so the picking-up lane is empty. The launching lane runs on product text and works without it.';
  }
  const bits: string[] = [];
  const top = pick[0];
  if (top) {
    bits.push(
      top.isNew
        ? `${cap(top.label)} frames are breaking out — ${top.currentAccounts} accounts picked them up this period from a standing start`
        : `${cap(top.label)} frames are accelerating — ${top.currentAccounts} accounts now (+${top.accountsDelta} vs prior)`,
    );
  }
  const tl = launch[0];
  if (tl) bits.push(`${tl.brands} brands are converging on ${tl.label} frames`);
  return bits.join('. ') + '.';
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ─── Handler ─── */

export const GET = withHandler('shifts', async (request: NextRequest) => {
  const v = validateQuery(request, QuerySchema);
  if (!v.ok) return v.response;
  const { window = 30, region = 'ALL', minAdopters = 3, minBrands = 3, scan = 48, refresh } = v.data;

  const cacheKey = `${window}:${region}:${minAdopters}:${minBrands}`;
  const now = Date.now();
  if (!refresh) {
    const c = RESULT_CACHE.get(cacheKey);
    if (c && c.expiresAt > now) return ok({ ...c.payload, cached: true });
  }

  const visionEnabled = hasEnv('GEMINI_API_KEY');
  const ref = await maxPostedAt();
  const wMs = window * DAY;

  // ── Lane A: picking up ──
  const curRows = await fetchPosts(new Date(ref - wMs).toISOString(), new Date(ref + DAY).toISOString());
  const priorRows = await fetchPosts(new Date(ref - 2 * wMs).toISOString(), new Date(ref - wMs).toISOString());

  // Persist Vision for the current window first (it's what we surface).
  const vis = await ensureVision(curRows, scan);
  const priorScan = Math.max(0, scan - vis.analyzed);
  const visPrior = await ensureVision(priorRows, priorScan);

  const handles = [...new Set([...curRows, ...priorRows].map(r => r.brand_handle).filter(Boolean) as string[])];
  const meta = await brandMeta(handles);
  const nameOf = (h: string | null) => (h && meta.get(h)?.name) || h || 'unknown';
  const regionOf = (h: string | null) => (h && meta.get(h)?.region) || 'Global';

  const regionFilter = (h: string | null) =>
    region === 'ALL' ? true : regionOf(h).toLowerCase().includes(region.toLowerCase());

  const curSignals: PostSignal[] = curRows
    .filter(r => regionFilter(r.brand_handle))
    .map(r => toPostSignal(r, rowVision(r), nameOf(r.brand_handle)));
  const priorSignals: PostSignal[] = priorRows
    .filter(r => regionFilter(r.brand_handle))
    .map(r => toPostSignal(r, rowVision(r), nameOf(r.brand_handle)));

  const pickingUp = rankPickingUp(curSignals, priorSignals, { minAdopters });

  // ── Lane B: launching ──
  const productRows = await fetchProducts();
  const productSignals = productRows.map(toProductSignal);
  const launching = rankLaunching(productSignals, { minBrands });

  const payload: ShiftsResult = {
    refDate: new Date(ref).toISOString(),
    window,
    region,
    pickingUp,
    launching,
    summary: buildSummary(pickingUp, launching, visionEnabled),
    meta: {
      postsCurrent: curRows.length,
      postsPrior: priorRows.length,
      visionAnalyzed: vis.analyzed + visPrior.analyzed,
      visionPending: vis.pending + visPrior.pending,
      productsScanned: productRows.length,
      visionEnabled,
    },
    generatedAt: new Date().toISOString(),
    cached: false,
  };

  RESULT_CACHE.set(cacheKey, { payload, expiresAt: now + TTL_MS });
  return ok(payload);
});
