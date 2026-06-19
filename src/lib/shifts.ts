/**
 * Trend-shift detection.
 *
 * The Shifts surface answers one question the generic Trends page can't:
 * "What concrete frame is *moving right now* — not what's evergreen."
 *
 * Two lanes, each filtered so ONLY genuine shifts survive (never the
 * steady baseline):
 *
 *   1. Picking up  — a concrete frame signature (shape + colour + material)
 *      that an *accelerating* number of distinct Instagram accounts /
 *      influencers are posting week-over-week.
 *   2. Launching   — a concrete frame signature that an unusually high
 *      number of distinct brands are launching / carrying at once
 *      (cross-brand convergence). Sharpens as product scrape history
 *      accumulates real first_seen_at spread.
 *
 * Everything here is pure so it can be unit-tested without a DB or Gemini.
 */

/* ─── Controlled vocabulary (shared with the Vision extractor) ─── */

export const SHAPES = [
  'aviator', 'cat-eye', 'round', 'square', 'rectangle', 'oval', 'wayfarer',
  'oversized', 'geometric', 'rimless', 'wrap', 'browline', 'shield',
] as const;

export const COLORS = [
  'black', 'tortoise', 'gold', 'silver', 'clear', 'brown', 'red', 'blue',
  'white', 'pastel', 'pink', 'green', 'yellow', 'multicolor',
] as const;

export const MATERIALS = [
  'acetate', 'metal', 'titanium', 'mixed', 'plastic', 'wood', 'rimless',
] as const;

export interface FrameAttrs {
  shape?: string;
  color?: string;
  material?: string;
  lensType?: string;
  style?: string;
}

/* ─── Signature: the concrete identity of a frame ─── */

export interface Signature {
  key: string;   // stable grouping key, e.g. "round|clear|acetate"
  label: string; // human label, e.g. "clear acetate round"
  facets: number; // how many of shape/colour/material are specified
}

/**
 * Build a frame signature from attributes. Returns null when the frame is
 * too generic to be a meaningful trend (we require a shape plus at least
 * one of colour/material — a bare "black" is noise, "black metal aviator"
 * is a frame). This null gate is what keeps the surface free of generic
 * eyewear.
 */
export function signatureOf(attrs: FrameAttrs | undefined): Signature | null {
  if (!attrs) return null;
  const shape = norm(attrs.shape, SHAPES);
  const color = norm(attrs.color, COLORS);
  const material = norm(attrs.material, MATERIALS);

  if (!shape) return null;
  const facets = 1 + (color ? 1 : 0) + (material ? 1 : 0);
  if (facets < 2) return null; // shape alone is too generic

  const key = [shape, color || '_', material || '_'].join('|');
  const label = [color, material, shape].filter(Boolean).join(' ');
  return { key, label, facets };
}

function norm(v: string | undefined, allowed: readonly string[]): string | undefined {
  if (!v) return undefined;
  const t = v.toLowerCase().trim();
  return allowed.includes(t) ? t : undefined;
}

/* ─── Deriving attributes from product text (no Vision cost) ─── */

const TEXT_SYNONYMS: Record<string, string> = {
  // shapes
  'cat eye': 'cat-eye', 'cateye': 'cat-eye', "cat's eye": 'cat-eye',
  rectangular: 'rectangle', 'semi-rimless': 'browline', semirimless: 'browline',
  pilot: 'aviator', wraparound: 'wrap', 'wrap-around': 'wrap',
  // colours
  transparent: 'clear', crystal: 'clear', translucent: 'clear',
  tortoiseshell: 'tortoise', havana: 'tortoise',
  gunmetal: 'silver', rose: 'pink', burgundy: 'red',
  // materials
  'stainless steel': 'metal', steel: 'metal', alloy: 'metal',
  bioacetate: 'acetate', 'bio-acetate': 'acetate', tr90: 'plastic', nylon: 'plastic',
  bamboo: 'wood', walnut: 'wood',
};

/**
 * Best-effort attribute extraction from a product title / type / tags.
 * Keyword + synonym match against the same vocabulary the Vision pipeline
 * uses, so IG and product signatures line up.
 */
export function deriveAttrsFromText(...parts: Array<string | null | undefined>): FrameAttrs {
  const hay = ' ' + parts.filter(Boolean).join(' ').toLowerCase() + ' ';
  const find = (vocab: readonly string[]): string | undefined => {
    // multi-word synonyms first so "cat eye" wins over "eye"
    for (const [phrase, canon] of Object.entries(TEXT_SYNONYMS)) {
      if (vocab.includes(canon) && hay.includes(` ${phrase} `)) return canon;
      if (vocab.includes(canon) && hay.includes(phrase)) return canon;
    }
    for (const term of vocab) {
      if (hay.includes(term.replace('-', ' ')) || hay.includes(term)) return term;
    }
    return undefined;
  };
  return {
    shape: find(SHAPES),
    color: find(COLORS),
    material: find(MATERIALS),
  };
}

/* ─── Lane A · Picking up ─── */

export interface PostSignal {
  id: string;
  account: string;       // brand_handle / IG handle
  accountName: string;   // display name
  attrs?: FrameAttrs;
  weight: number;        // engagement weight
  likes: number;
  imageUrl: string;
  postUrl: string;
}

export interface ShiftExample {
  account: string;
  accountName: string;
  imageUrl: string;
  url: string;
  likes: number;
}

export interface PickingUpShift {
  signature: string;
  label: string;
  currentAccounts: number;
  priorAccounts: number;
  accountsDelta: number;
  deltaPct: number;
  isNew: boolean;
  posts: number;
  weightedEngagement: number;
  momentum: number;
  examples: ShiftExample[];
}

export interface PickingUpOptions {
  minAdopters?: number; // distinct accounts required in current window
  topN?: number;
}

/**
 * Rank frame signatures by adoption *acceleration*. Only signatures that
 * (a) reached the adopter floor and (b) are new or gaining adopters
 * survive — a flat or shrinking signature is established, not a shift.
 */
export function rankPickingUp(
  current: PostSignal[],
  prior: PostSignal[],
  opts: PickingUpOptions = {},
): PickingUpShift[] {
  const minAdopters = opts.minAdopters ?? 3;
  const topN = opts.topN ?? 12;

  type Agg = {
    label: string;
    accounts: Set<string>;
    posts: number;
    weighted: number;
    examples: PostSignal[];
  };
  const cur = new Map<string, Agg>();
  for (const p of current) {
    const sig = signatureOf(p.attrs);
    if (!sig) continue;
    const a = cur.get(sig.key) || { label: sig.label, accounts: new Set(), posts: 0, weighted: 0, examples: [] };
    a.accounts.add(p.account);
    a.posts++;
    a.weighted += p.weight;
    a.examples.push(p);
    cur.set(sig.key, a);
  }
  const priorAccounts = new Map<string, Set<string>>();
  for (const p of prior) {
    const sig = signatureOf(p.attrs);
    if (!sig) continue;
    const s = priorAccounts.get(sig.key) || new Set<string>();
    s.add(p.account);
    priorAccounts.set(sig.key, s);
  }

  const shifts: PickingUpShift[] = [];
  for (const [key, a] of cur) {
    const currentAccounts = a.accounts.size;
    if (currentAccounts < minAdopters) continue;
    const prevN = priorAccounts.get(key)?.size || 0;
    const accountsDelta = currentAccounts - prevN;
    const isNew = prevN === 0;
    if (!isNew && accountsDelta < 1) continue; // flat / shrinking → not a shift

    const deltaPct = prevN > 0 ? Math.round((accountsDelta / prevN) * 100) : 999;
    const momentum = accountsDelta * 10 + currentAccounts * 3 + Math.log10(a.weighted + 10);

    const examples = dedupeByAccount(a.examples)
      .sort((x, y) => y.weight - x.weight)
      .slice(0, 4)
      .map(toExample);

    shifts.push({
      signature: key,
      label: a.label,
      currentAccounts,
      priorAccounts: prevN,
      accountsDelta,
      deltaPct,
      isNew,
      posts: a.posts,
      weightedEngagement: Math.round(a.weighted),
      momentum: Math.round(momentum * 10) / 10,
      examples,
    });
  }

  return shifts.sort((a, b) => b.momentum - a.momentum).slice(0, topN);
}

function dedupeByAccount(posts: PostSignal[]): PostSignal[] {
  const seen = new Set<string>();
  const out: PostSignal[] = [];
  for (const p of [...posts].sort((a, b) => b.weight - a.weight)) {
    if (seen.has(p.account)) continue;
    seen.add(p.account);
    out.push(p);
  }
  return out;
}

function toExample(p: PostSignal): ShiftExample {
  return { account: p.account, accountName: p.accountName, imageUrl: p.imageUrl, url: p.postUrl, likes: p.likes };
}

/* ─── Lane B · Launching (cross-brand convergence) ─── */

export interface ProductSignal {
  id: string;
  brand: string;       // brand_handle
  brandName: string;
  attrs?: FrameAttrs;
  firstSeenMs: number | null;
  price: number | null;
  currency: string | null;
  imageUrl: string;
  url: string;
  title: string;
}

export interface LaunchExample {
  brand: string;
  brandName: string;
  title: string;
  price: number | null;
  currency: string | null;
  imageUrl: string;
  url: string;
}

export interface LaunchingShift {
  signature: string;
  label: string;
  brands: number;          // distinct brands carrying/launching this frame
  recentBrands: number;    // distinct brands with a fresh first_seen in window
  products: number;
  momentum: number;
  examples: LaunchExample[]; // one per brand
}

export interface LaunchingOptions {
  minBrands?: number;       // convergence floor
  recencyWindowMs?: number; // how recent a first_seen counts as "fresh"
  nowMs?: number;           // injectable clock; defaults to max firstSeen in data
  topN?: number;
}

/**
 * Detect frames that many brands are launching/carrying at once. A frame
 * offered by a single brand is a product, not a trend — only signatures
 * crossing the brand floor survive. Recency (fresh first_seen) boosts the
 * momentum so genuine new drops outrank evergreen catalog overlap as
 * scrape history fills in.
 */
export function rankLaunching(
  products: ProductSignal[],
  opts: LaunchingOptions = {},
): LaunchingShift[] {
  const minBrands = opts.minBrands ?? 3;
  const topN = opts.topN ?? 12;

  const maxSeen = opts.nowMs ?? products.reduce((m, p) => Math.max(m, p.firstSeenMs || 0), 0);
  const recencyWindow = opts.recencyWindowMs ?? 30 * 86400 * 1000;
  const freshCutoff = maxSeen - recencyWindow;

  type Agg = {
    label: string;
    brands: Set<string>;
    freshBrands: Set<string>;
    products: number;
    byBrand: Map<string, ProductSignal>;
  };
  const groups = new Map<string, Agg>();
  for (const p of products) {
    const sig = signatureOf(p.attrs);
    if (!sig) continue;
    const g = groups.get(sig.key) || { label: sig.label, brands: new Set(), freshBrands: new Set(), products: 0, byBrand: new Map() };
    g.brands.add(p.brand);
    g.products++;
    if (p.firstSeenMs && p.firstSeenMs >= freshCutoff) g.freshBrands.add(p.brand);
    // keep the best (priced, imaged) representative per brand
    const cur = g.byBrand.get(p.brand);
    if (!cur || rep(p) > rep(cur)) g.byBrand.set(p.brand, p);
    groups.set(sig.key, g);
  }

  const shifts: LaunchingShift[] = [];
  for (const [key, g] of groups) {
    const brands = g.brands.size;
    if (brands < minBrands) continue;
    const recentBrands = g.freshBrands.size;
    const momentum = brands * 5 + recentBrands * 5 + g.products * 0.1;
    const examples = [...g.byBrand.values()]
      .sort((a, b) => rep(b) - rep(a))
      .slice(0, 4)
      .map(toLaunchExample);
    shifts.push({
      signature: key,
      label: g.label,
      brands,
      recentBrands,
      products: g.products,
      momentum: Math.round(momentum * 10) / 10,
      examples,
    });
  }

  return shifts.sort((a, b) => b.momentum - a.momentum).slice(0, topN);
}

function rep(p: ProductSignal): number {
  return (p.imageUrl ? 2 : 0) + (p.price ? 1 : 0) + (p.firstSeenMs || 0) / 1e13;
}

function toLaunchExample(p: ProductSignal): LaunchExample {
  return {
    brand: p.brand, brandName: p.brandName, title: p.title,
    price: p.price, currency: p.currency, imageUrl: p.imageUrl, url: p.url,
  };
}
