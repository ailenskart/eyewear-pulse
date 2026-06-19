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

export interface FrameInstance {
  id: string;
  entity: string;     // IG account handle (wearing) or brand handle (launching)
  entityName: string; // display name
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
  priorPeople: number;
  growth: number;
  isNew: boolean;
  posts: number;
  examples: FrameExample[];
}

export interface LaunchShift {
  id: string;
  label: string;
  heroImage: string;
  heroUrl: string;
  brands: number;
  products: number;
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

    shifts.push({
      id: c.repId,
      label: opts.labels?.get(c.repId) || '',
      heroImage: hero.image,
      heroUrl: hero.url,
      people,
      priorPeople,
      growth,
      isNew,
      posts: c.memberIds.length,
      examples: members.slice(0, 6).map(toExample),
    });
  }

  // Lead with the most-worn, then the fastest-growing.
  return shifts
    .sort((a, b) => b.people - a.people || b.growth - a.growth)
    .slice(0, topN);
}

/* ─── Launching lane ─── */

export interface LaunchOptions {
  minBrands?: number;
  topN?: number;
  labels?: Map<string, string>;
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

    shifts.push({
      id: c.repId,
      label: opts.labels?.get(c.repId) || '',
      heroImage: hero.image,
      heroUrl: hero.url,
      brands,
      products: c.memberIds.length,
      examples: members.slice(0, 6).map(toExample),
    });
  }

  return shifts.sort((a, b) => b.brands - a.brands || b.products - a.products).slice(0, topN);
}

function toExample(i: FrameInstance): FrameExample {
  return { entity: i.entity, entityName: i.entityName, image: i.image, url: i.url };
}
