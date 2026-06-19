import { NextRequest } from 'next/server';
import { withHandler, ok, validateQuery } from '@/lib/api';
import { supabaseServer } from '@/lib/supabase';
import { env, hasEnv } from '@/lib/env';
import { clusterByCosine, assignToClusters, cosine, type VecItem } from '@/lib/cluster';
import {
  buildWearShifts, buildLaunchShifts,
  type FrameInstance, type WearShift, type LaunchShift,
} from '@/lib/shifts';
import { extractFrameAttrs } from '@/lib/vision-attrs';
import { z } from 'zod';

/**
 * GET /api/shifts — specific frames that are actually moving, shown by image.
 *
 *   ?window=30        days per period (current vs prior) for the wearing lane
 *   ?region=Europe    optional region filter (wearing lane)
 *   ?minPeople=3      distinct accounts needed for a "wearing" frame
 *   ?minBrands=3      distinct brands needed for a "launching" frame
 *   ?threshold=0.88   CLIP cosine cutoff for "same frame"
 *   ?refresh=1        bypass cache
 *
 * Frames are grouped by CLIP visual similarity (the same frame), not by
 * attribute tags. Windows are measured back from the freshest post we hold.
 * Requires the image index — run /api/shifts/embed to populate it.
 */

export const maxDuration = 60;

const QuerySchema = z.object({
  window: z.coerce.number().int().min(1).max(120).optional(),
  region: z.string().optional(),
  minPeople: z.coerce.number().int().min(2).max(20).optional(),
  minBrands: z.coerce.number().int().min(2).max(20).optional(),
  threshold: z.coerce.number().min(0.5).max(0.99).optional(),
  refresh: z.coerce.number().optional(),
});

interface ShiftsResult {
  refDate: string;
  window: number;
  region: string;
  wearing: WearShift[];
  launching: LaunchShift[];
  summary: string;
  meta: {
    igEmbedded: number; igTotal: number;
    productEmbedded: number; productTotal: number;
    clusteredCurrent: number;
    needsBackfill: boolean;
  };
  generatedAt: string;
  cached: boolean;
}

const RESULT_CACHE = new Map<string, { payload: ShiftsResult; expiresAt: number }>();
const TTL_MS = 6 * 60 * 60 * 1000;
const DAY = 86400 * 1000;
const CLUSTER_CAP = 700; // top-engagement images clustered per window

const proxy = (u?: string | null) => (u ? (u.includes('cdninstagram.com') ? `/api/img?url=${encodeURIComponent(u)}` : u) : '');

/* ─── DB helpers ─── */

interface ContentRow {
  id: number;
  brand_handle: string | null;
  posted_at: string | null;
  likes: number | null;
  comments: number | null;
  title: string | null;
  price: number | null;
  currency: string | null;
  image_url: string | null;
  blob_url: string | null;
  url: string | null;
  data: Record<string, unknown> | null;
}

const fetchableImage = (r: ContentRow) =>
  r.blob_url || (r.data?.display_url as string) || r.image_url || (r.data?.product_image as string) || '';

async function fetchPosts(startISO: string, endISO: string): Promise<ContentRow[]> {
  const { data } = await supabaseServer()
    .from('brand_content')
    .select('id, brand_handle, posted_at, likes, comments, title, price, currency, image_url, blob_url, url, data')
    .eq('type', 'ig_post')
    .gte('posted_at', startISO).lt('posted_at', endISO)
    .order('posted_at', { ascending: false })
    .limit(2000);
  return (data as unknown as ContentRow[]) || [];
}

async function fetchProductsWithEmbeddings(cap = 4000): Promise<ContentRow[]> {
  // Drive off the embedding table so we only pull products we can cluster.
  const client = supabaseServer();
  const { data: emb } = await client
    .from('content_image_embeddings')
    .select('content_id')
    .eq('ctype', 'product')
    .limit(cap);
  const ids = (emb || []).map(e => (e as { content_id: number }).content_id);
  if (ids.length === 0) return [];
  const out: ContentRow[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await client
      .from('brand_content')
      .select('id, brand_handle, posted_at, likes, comments, title, price, currency, image_url, blob_url, url, data')
      .in('id', ids.slice(i, i + 300));
    out.push(...((data as unknown as ContentRow[]) || []));
  }
  return out;
}

async function fetchEmbeddings(ids: number[]): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  if (ids.length === 0) return map;
  const client = supabaseServer();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await client
      .from('content_image_embeddings')
      .select('content_id, embedding')
      .in('content_id', ids.slice(i, i + 300));
    for (const row of (data || []) as Array<{ content_id: number; embedding: number[] }>) {
      if (Array.isArray(row.embedding)) map.set(String(row.content_id), row.embedding);
    }
  }
  return map;
}

async function countContent(type: string): Promise<number> {
  const { count } = await supabaseServer()
    .from('brand_content').select('id', { count: 'exact', head: true }).eq('type', type);
  return count || 0;
}
async function countEmbedded(ctype: string): Promise<number> {
  const { count } = await supabaseServer()
    .from('content_image_embeddings').select('content_id', { count: 'exact', head: true }).eq('ctype', ctype);
  return count || 0;
}

async function brandMeta(handles: string[]): Promise<Map<string, { name: string; region: string }>> {
  const map = new Map<string, { name: string; region: string }>();
  if (handles.length === 0) return map;
  const client = supabaseServer();
  for (let i = 0; i < handles.length; i += 500) {
    const { data } = await client
      .from('tracked_brands').select('handle, name, region')
      .in('handle', handles.slice(i, i + 500));
    for (const b of (data || []) as Array<{ handle: string; name: string; region: string }>) {
      map.set(b.handle, { name: b.name || b.handle, region: b.region || 'Global' });
    }
  }
  return map;
}

/* ─── Cluster labels (best-effort, image-derived caption) ─── */

async function labelClusters(reps: Array<{ id: string; url: string }>): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (!hasEnv('GEMINI_API_KEY') || reps.length === 0) return labels;
  try {
    const attrs = await extractFrameAttrs(env.GEMINI_API_KEY(), reps.slice(0, 18));
    for (const r of reps) {
      const a = attrs.get(r.id);
      if (!a) continue;
      const label = [a.color, a.material, a.shape].filter(Boolean).join(' ');
      if (label) labels.set(r.id, label);
    }
  } catch { /* labels are optional */ }
  return labels;
}

/* ─── Summary ─── */

function buildSummary(wear: WearShift[], launch: LaunchShift[], needsBackfill: boolean): string {
  if (needsBackfill) {
    return 'The visual index is still building. Run the image embedder, then specific frames people are wearing will appear here.';
  }
  if (wear.length === 0 && launch.length === 0) {
    return 'No frame has crossed the adoption threshold in this window yet. Widen the window or lower the threshold.';
  }
  const bits: string[] = [];
  const w = wear[0];
  if (w) {
    const name = w.label ? `${w.label} frames` : 'One frame';
    const conf = w.confidence.level === 'high' ? 'High confidence' : w.confidence.level === 'medium' ? 'Medium confidence' : 'Early signal';
    bits.push(`${conf}: ${name} — worn by ${w.people}${w.organicPeople > 0 ? `, ${w.organicPeople} real ${w.organicPeople === 1 ? 'consumer' : 'consumers'}` : ''}${w.growth > 0 ? ` (+${w.growth})` : ''}`);
  }
  const l = launch.find(x => x.alsoWorn) || launch[0];
  if (l) bits.push(`${l.brands} brands launching ${l.label ? `${l.label} frames` : 'the same frame'}${l.alsoWorn ? ' that consumers are already wearing' : ''}`);
  return bits.join('. ') + '.';
}

/* ─── Handler ─── */

export const GET = withHandler('shifts', async (request: NextRequest) => {
  const v = validateQuery(request, QuerySchema);
  if (!v.ok) return v.response;
  const { window = 30, region = 'ALL', minPeople = 3, minBrands = 3, threshold = 0.88, refresh } = v.data;

  const cacheKey = `${window}:${region}:${minPeople}:${minBrands}:${threshold}`;
  const now = Date.now();
  if (!refresh) {
    const c = RESULT_CACHE.get(cacheKey);
    if (c && c.expiresAt > now) return ok({ ...c.payload, cached: true });
  }

  // Coverage stats.
  const [igTotal, igEmbedded, productTotal, productEmbedded] = await Promise.all([
    countContent('ig_post'), countEmbedded('ig_post'),
    countContent('product'), countEmbedded('product'),
  ]);

  const needsBackfill = igEmbedded === 0 && productEmbedded === 0;

  // ── Reference clock = freshest post ──
  const { data: latest } = await supabaseServer()
    .from('brand_content').select('posted_at').eq('type', 'ig_post')
    .not('posted_at', 'is', null).order('posted_at', { ascending: false }).limit(1);
  const ref = latest?.[0]?.posted_at ? new Date(latest[0].posted_at).getTime() : now;
  const wMs = window * DAY;

  // ── Wearing lane ──
  let wearing: WearShift[] = [];
  let clusteredCurrent = 0;
  // Wearing cluster reps (with vectors) + people counts, reused to validate
  // launches against real consumer demand.
  let wearReps: Array<{ repId: string; vector: number[] }> = [];
  const wearPeopleByRep = new Map<string, number>();
  if (igEmbedded > 0) {
    const curRows = await fetchPosts(new Date(ref - wMs).toISOString(), new Date(ref + DAY).toISOString());
    const priorRows = await fetchPosts(new Date(ref - 2 * wMs).toISOString(), new Date(ref - wMs).toISOString());

    const handles = [...new Set([...curRows, ...priorRows].map(r => r.brand_handle).filter(Boolean) as string[])];
    const meta = await brandMeta(handles);
    const regionOf = (h: string | null) => (h && meta.get(h)?.region) || 'Global';
    const inRegion = (h: string | null) => region === 'ALL' || regionOf(h).toLowerCase().includes(region.toLowerCase());

    const eng = (r: ContentRow) => Math.max(0, Number(r.likes) || 0) + Math.max(0, Number(r.comments) || 0) * 5;
    const curTop = curRows.filter(r => inRegion(r.brand_handle) && fetchableImage(r))
      .sort((a, b) => eng(b) - eng(a)).slice(0, CLUSTER_CAP);
    const priorTop = priorRows.filter(r => inRegion(r.brand_handle) && fetchableImage(r))
      .sort((a, b) => eng(b) - eng(a)).slice(0, CLUSTER_CAP);

    const curVecs = await fetchEmbeddings(curTop.map(r => r.id));
    const priorVecs = await fetchEmbeddings(priorTop.map(r => r.id));

    const byId = new Map<string, FrameInstance>();
    const items: VecItem[] = [];
    for (const r of curTop) {
      const vec = curVecs.get(String(r.id));
      if (!vec) continue;
      const w = eng(r);
      byId.set(String(r.id), {
        id: String(r.id),
        entity: r.brand_handle || 'unknown',
        entityName: (r.brand_handle && meta.get(r.brand_handle)?.name) || r.brand_handle || 'unknown',
        // In tracked_brands ⇒ a brand voice; otherwise a real consumer / UGC.
        isBrand: !!(r.brand_handle && meta.has(r.brand_handle)),
        image: proxy(fetchableImage(r)),
        url: r.url || (r.data?.post_url as string) || '',
        weight: w,
      });
      items.push({ id: String(r.id), vector: vec, weight: w });
    }
    clusteredCurrent = items.length;

    const clusters = clusterByCosine(items, threshold);
    const reps = clusters.map(c => ({ repId: c.repId, vector: curVecs.get(c.repId)! })).filter(r => r.vector);

    // Fold prior window onto current clusters to measure adopter growth.
    const priorItems: VecItem[] = priorTop
      .filter(r => priorVecs.has(String(r.id)))
      .map(r => ({ id: String(r.id), vector: priorVecs.get(String(r.id))!, weight: eng(r) }));
    const priorAssign = assignToClusters(priorItems, reps, threshold);
    const priorHandleById = new Map(priorTop.map(r => [String(r.id), r.brand_handle || 'unknown']));
    const priorByRep = new Map<string, Set<string>>();
    for (const [itemId, repId] of priorAssign) {
      const s = priorByRep.get(repId) || new Set<string>();
      s.add(priorHandleById.get(itemId) || 'unknown');
      priorByRep.set(repId, s);
    }

    // Build shifts, then label the surfaced clusters' hero images.
    const draft = buildWearShifts(clusters, byId, priorByRep, { minPeople });
    const labels = await labelClusters(draft.map(s => ({ id: s.id, url: rawOfId(byId, curTop, s.id) })));
    wearing = buildWearShifts(clusters, byId, priorByRep, { minPeople, labels });

    // Expose surfaced clusters' vectors + people counts for launch validation.
    const repVec = new Map(reps.map(r => [r.repId, r.vector]));
    wearReps = wearing.map(s => ({ repId: s.id, vector: repVec.get(s.id)! })).filter(r => r.vector);
    for (const s of wearing) wearPeopleByRep.set(s.id, s.people);
  }

  // ── Launching lane ──
  let launching: LaunchShift[] = [];
  if (productEmbedded > 0) {
    const prodRows = await fetchProductsWithEmbeddings();
    const prodVecs = await fetchEmbeddings(prodRows.map(r => r.id));
    const byId = new Map<string, FrameInstance>();
    const items: VecItem[] = [];
    for (const r of prodRows) {
      const vec = prodVecs.get(String(r.id));
      if (!vec || !fetchableImage(r)) continue;
      byId.set(String(r.id), {
        id: String(r.id),
        entity: r.brand_handle || 'unknown',
        entityName: (r.data?.brand_display as string) || r.brand_handle || 'unknown',
        isBrand: true, // products are always brand supply
        image: proxy(fetchableImage(r)),
        url: r.url || '',
        weight: (r.blob_url ? 2 : 0) + (r.price ? 1 : 0),
        price: r.price ?? null,
        currency: r.currency ?? null,
        title: r.title || (r.data?.product_title as string) || '',
      });
      items.push({ id: String(r.id), vector: vec, weight: byId.get(String(r.id))!.weight });
    }
    const clusters = clusterByCosine(items, threshold);

    // Demand validation: does this launched frame match one consumers wear?
    const MATCH = Math.max(0.82, threshold - 0.03);
    const alsoWornReps = new Set<string>();
    const wornByRep = new Map<string, number>();
    for (const c of clusters) {
      const lv = prodVecs.get(c.repId);
      if (!lv) continue;
      for (const wr of wearReps) {
        if (cosine(lv, wr.vector) >= MATCH) {
          alsoWornReps.add(c.repId);
          wornByRep.set(c.repId, wearPeopleByRep.get(wr.repId) || 0);
          break;
        }
      }
    }

    const draft = buildLaunchShifts(clusters, byId, { minBrands, alsoWornReps, wornByRep });
    const labels = await labelClusters(draft.map(s => ({ id: s.id, url: rawOfId(byId, prodRows, s.id) })));
    launching = buildLaunchShifts(clusters, byId, { minBrands, labels, alsoWornReps, wornByRep });
  }

  const payload: ShiftsResult = {
    refDate: new Date(ref).toISOString(),
    window, region, wearing, launching,
    summary: buildSummary(wearing, launching, needsBackfill),
    meta: { igEmbedded, igTotal, productEmbedded, productTotal, clusteredCurrent, needsBackfill },
    generatedAt: new Date().toISOString(),
    cached: false,
  };

  RESULT_CACHE.set(cacheKey, { payload, expiresAt: now + TTL_MS });
  return ok(payload);
});

/** Raw (un-proxied) image for a cluster rep, so Gemini/Replicate can fetch it. */
function rawOfId(byId: Map<string, FrameInstance>, rows: ContentRow[], id: string): string {
  const row = rows.find(r => String(r.id) === id);
  if (row) return fetchableImage(row);
  return byId.get(id)?.image || '';
}
