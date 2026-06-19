/**
 * Confidence scoring — "how hard should we chase this trend?"
 *
 * Confidence is our proxy for sales/demand. The strongest validator is
 * REAL consumers wearing and posting a frame (any posting account that
 * isn't one of our tracked brands = organic/UGC demand), not brands or
 * paid influencers pushing it. Engagement, breadth and acceleration add
 * to it; for launches, a frame consumers are ALSO wearing is the highest
 * signal — supply meeting proven demand.
 *
 * Pure + deterministic so it can be unit-tested and explained on a card.
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface Confidence {
  level: ConfidenceLevel;
  score: number; // 0–100, internal — UI shows the level + reason
  reason: string;
}

const levelOf = (score: number): ConfidenceLevel =>
  score >= 65 ? 'high' : score >= 35 ? 'medium' : 'low';

const fmt = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
  n >= 1_000 ? `${Math.round(n / 1000)}k` : String(n);

/* ─── Wearing: a frame people are wearing ─── */

export interface WearConfidenceInput {
  organicPeople: number; // distinct non-brand (real consumer) accounts
  totalPeople: number;   // all distinct accounts wearing it
  growth: number;        // adopter delta vs prior window
  isNew: boolean;
  engagement: number;    // total likes + comments across the cluster
}

export function wearConfidence(i: WearConfidenceInput): Confidence {
  const organicW = i.organicPeople * 20;            // real consumers dominate
  const breadthW = i.totalPeople * 3;
  const velocityW = Math.max(0, i.growth) * 8 + (i.isNew ? 6 : 0);
  const engW = Math.min(30, Math.log10(i.engagement + 1) * 7);
  const score = Math.min(100, Math.round(organicW + breadthW + velocityW + engW));

  const parts: string[] = [];
  if (i.organicPeople > 0) {
    parts.push(`${i.organicPeople} real ${i.organicPeople === 1 ? 'person' : 'people'} wearing it`);
  } else {
    parts.push('brand-led, no consumer posts yet');
  }
  if (i.isNew) parts.push('just broke out');
  else if (i.growth > 0) parts.push(`+${i.growth} this period`);
  if (i.engagement >= 10_000) parts.push(`${fmt(i.engagement)} engagements`);

  return { level: levelOf(score), score, reason: parts.slice(0, 3).join(' · ') };
}

/* ─── Launching: a frame brands are launching ─── */

export interface LaunchConfidenceInput {
  brands: number;       // distinct brands launching/carrying it
  recentBrands: number; // brands with a fresh first_seen
  products: number;
  alsoWorn: boolean;    // consumers are also wearing this exact frame
  wornBy?: number;      // how many people, when alsoWorn
}

export function launchConfidence(i: LaunchConfidenceInput): Confidence {
  let score = i.brands * 12 + i.recentBrands * 6 + Math.min(10, i.products * 0.3);
  if (i.alsoWorn) score += 35; // demand meets supply — the strongest signal
  score = Math.min(100, Math.round(score));

  const parts: string[] = [`${i.brands} brands launching`];
  if (i.alsoWorn) parts.push(i.wornBy ? `consumers wearing it (${i.wornBy})` : 'consumers already wearing it');
  if (i.recentBrands > 0) parts.push(`${i.recentBrands} just dropped`);

  return { level: levelOf(score), score, reason: parts.slice(0, 3).join(' · ') };
}
