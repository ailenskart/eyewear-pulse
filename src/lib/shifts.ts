/**
 * Shaping visual clusters into the two Shifts lanes.
 *
 * The unit here is a *specific frame* (a CLIP cluster of near-identical
 * glasses), never an attribute bucket. We surface only frames that pass a
 * real adoption / convergence floor:
 *
 *   - Wearing   — a specific frame that many distinct accounts are posting
 *                 (and, ideally, more than last period).
 *   - Launching — a specific frame that many distinct brands carry/launch.
 *
 * Pure functions over already-clustered data so the algorithm is testable
 * without a DB, Replicate, or Gemini.
 */

import type { Cluster } from '@/lib/cluster';
import { wearConfidence, launchConfidence, type Confidence } from '@/lib/confidence';

export interface FrameInstance {
  id: string;
  entity: string;     // IG account handle (wearing) or brand handle (launching)
  entityName: string; // display name
  isBrand: boolean;   // true if entity is a tracked brand (not an organic consumer)
  image: string;      // display image (proxied)
  url: string;        // link to the post / product
  weight: number;     // engagement (wearing) or representativeness (launching)
  price?: number | null;
  currency?: string | null;
  title?: string;
}

export interface FrameExample {
  entity: string;
  entityName: string;
  image: string;
  url: string;
}

export interface WearShift {
  id: string;            // cluster rep id
  label: string;         // optional short caption ("" when unknown)
  heroImage: string;
  heroUrl: string;
  people: number;        // distinct accounts wearing it this period
  organicPeople: number; // distinct REAL consumers (non-brand) wearing it
  priorPeople: number;
  growth: number;
  isNew: boolean;
  posts: number;
  confidence: Confidence;
  examples: FrameExample[];
}

export interface LaunchShift {
  id: string;
  label: string;
  heroImage: string;
  heroUrl: string;
  brands: number;
  products: number;
  alsoWorn: boolean;     // consumers are wearing this exact frame too
  confidence: Confidence;
  examples: FrameExample[];
}

/* ─── Helpers ─── */

function distinctByEntity(memberIds: string[], byId: Map<string, FrameInstance>): FrameInstance[] {
  const best = new Map<string, FrameInstance>();
  for (const id of memberIds) {
    const inst = byId.get(id);
    if (!inst) continue;
    const cur = best.get(inst.entity);
    if (!cur || inst.weight > cur.weight) best.set(inst.entity, inst);
  }
  return [...best.values()].sort((a, b) => b.weight - a.weight);
}

/* ─── Wearing lane ─── */

export interface WearOptions {
  minPeople?: number;
  topN?: number;
  labels?: Map<string, string>; // repId -> caption
}

/**
 * @param clusters    clusters built from the current window
 * @param byId        current-window instances keyed by id
 * @param priorByRep  repId -> set of distinct accounts that wore this frame
 *                    in the prior window (from assignToClusters)
 */
export function buildWearShifts(
  clusters: Cluster[],
  byId: Map<string, FrameInstance>,
  priorByRep: Map<string, Set<string>>,
  opts: WearOptions = {},
): WearShift[] {
  const minPeople = opts.minPeople ?? 3;
  const topN = opts.topN ?? 18;

  const shifts: WearShift[] = [];
  for (const c of clusters) {
    const members = distinctByEntity(c.memberIds, byId);
    const people = members.length;
    if (people < minPeople) continue;

    const hero = byId.get(c.repId) || members[0];
    if (!hero) continue;

    const priorPeople = priorByRep.get(c.repId)?.size ?? 0;
    const growth = people - priorPeople;
    const isNew = priorPeople === 0;
    const organicPeople = members.filter(m => !m.isBrand).length;
    // engagement = sum across every post in the cluster (consumer interest volume)
    const engagement = c.memberIds.reduce((s, id) => s + (byId.get(id)?.weight || 0), 0);

    shifts.push({
      id: c.repId,
      label: opts.labels?.get(c.repId) || '',
      heroImage: hero.image,
      heroUrl: hero.url,
      people,
      organicPeople,
      priorPeople,
      growth,
      isNew,
      posts: c.memberIds.length,
      confidence: wearConfidence({ organicPeople, totalPeople: people, growth, isNew, engagement }),
      examples: members.slice(0, 6).map(toExample),
    });
  }

  // Lead with the highest-confidence frames (what to actually pursue).
  return shifts
    .sort((a, b) => b.confidence.score - a.confidence.score || b.people - a.people)
    .slice(0, topN);
}

/* ─── Launching lane ─── */

export interface LaunchOptions {
  minBrands?: number;
  topN?: number;
  labels?: Map<string, string>;
  /** repIds whose frame consumers are also wearing (demand validation). */
  alsoWornReps?: Set<string>;
  /** repId -> how many people wear it, for the reason line. */
  wornByRep?: Map<string, number>;
}

export function buildLaunchShifts(
  clusters: Cluster[],
  byId: Map<string, FrameInstance>,
  opts: LaunchOptions = {},
): LaunchShift[] {
  const minBrands = opts.minBrands ?? 3;
  const topN = opts.topN ?? 12;

  const shifts: LaunchShift[] = [];
  for (const c of clusters) {
    const members = distinctByEntity(c.memberIds, byId);
    const brands = members.length;
    if (brands < minBrands) continue;

    const hero = byId.get(c.repId) || members[0];
    if (!hero) continue;

    const alsoWorn = opts.alsoWornReps?.has(c.repId) ?? false;
    shifts.push({
      id: c.repId,
      label: opts.labels?.get(c.repId) || '',
      heroImage: hero.image,
      heroUrl: hero.url,
      brands,
      products: c.memberIds.length,
      alsoWorn,
      confidence: launchConfidence({
        brands, recentBrands: 0, products: c.memberIds.length,
        alsoWorn, wornBy: opts.wornByRep?.get(c.repId),
      }),
      examples: members.slice(0, 6).map(toExample),
    });
  }

  // Lead with highest confidence (frames consumers validate), then breadth.
  return shifts.sort((a, b) => b.confidence.score - a.confidence.score || b.brands - a.brands).slice(0, topN);
}

function toExample(i: FrameInstance): FrameExample {
  return { entity: i.entity, entityName: i.entityName, image: i.image, url: i.url };
}
