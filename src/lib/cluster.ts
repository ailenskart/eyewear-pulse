/**
 * Visual clustering of frame images by CLIP-embedding similarity.
 *
 * The point of the Shifts surface is to group "the same frame" — not
 * frames that merely share a tag like "black round". Two photos belong to
 * the same cluster when their CLIP vectors are close in cosine space, i.e.
 * the glasses *look* the same.
 *
 * Greedy single-pass clustering: walk items heaviest-first (most engaging
 * leads), drop each into the first existing cluster whose representative is
 * within `threshold`, else start a new cluster. O(n·k) — fine for the few
 * hundred top images we cluster per window. All pure, no I/O.
 */

export interface VecItem {
  id: string;
  vector: number[];
  weight: number; // ordering signal (engagement); heaviest becomes the rep
}

export interface Cluster {
  repId: string;       // id of the representative (heaviest) member
  memberIds: string[]; // all member ids, rep first
}

/** Cosine similarity of two equal-length vectors. */
export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Cluster items by cosine similarity to cluster representatives.
 * `threshold` ~0.85–0.92 works well for CLIP ViT-L/14 "same frame".
 */
export function clusterByCosine(items: VecItem[], threshold = 0.88): Cluster[] {
  const sorted = [...items].sort((a, b) => b.weight - a.weight);
  const clusters: Array<{ rep: VecItem; members: string[] }> = [];

  for (const item of sorted) {
    let best: { c: (typeof clusters)[number]; sim: number } | null = null;
    for (const c of clusters) {
      const sim = cosine(item.vector, c.rep.vector);
      if (sim >= threshold && (!best || sim > best.sim)) best = { c, sim };
    }
    if (best) best.c.members.push(item.id);
    else clusters.push({ rep: item, members: [item.id] });
  }

  return clusters.map(c => ({ repId: c.rep.id, memberIds: c.members }));
}

/**
 * Assign each item to its nearest existing cluster representative (no new
 * clusters created). Used to fold the prior window onto current clusters
 * so we can measure growth in adopters. Items below `threshold` to every
 * rep are dropped (returns -1 → ignored by the caller).
 */
export function assignToClusters(
  items: VecItem[],
  reps: Array<{ repId: string; vector: number[] }>,
  threshold = 0.88,
): Map<string, string> {
  const out = new Map<string, string>(); // itemId -> repId
  for (const item of items) {
    let bestRep: string | null = null;
    let bestSim = threshold;
    for (const r of reps) {
      const sim = cosine(item.vector, r.vector);
      if (sim >= bestSim) { bestSim = sim; bestRep = r.repId; }
    }
    if (bestRep) out.set(item.id, bestRep);
  }
  return out;
}
