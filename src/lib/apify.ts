/**
 * Apify REST API helper — minimal fetch-based wrapper.
 *
 * We previously used the official `apify-client` SDK but it performs
 * dynamic `require()` calls internally that Next 16 + Turbopack can't
 * bundle, failing at runtime with "Cannot find module as expression
 * is too dynamic" on every actor call. The REST API is two fetches
 * and has none of those issues.
 *
 * Usage:
 *   const { ok, items } = await runActor('shu8hvrXbJbY3Eb9W', {
 *     directUrls: ['https://instagram.com/lenskart'],
 *     resultsType: 'posts',
 *     resultsLimit: 25,
 *   });
 *
 * Requires APIFY_TOKEN env var.
 */

const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
const BASE = 'https://api.apify.com/v2';

export interface ApifyRunOptions {
  timeout?: number;       // max seconds to wait for actor run
  memoryMbytes?: number;  // actor memory
  maxItems?: number;      // hard cap on items returned
}

export type ApifyResult<T> =
  | { ok: true; items: T[]; actor: string }
  | { ok: false; error: string; actor: string; needsSetup?: boolean };

export function isApifyConfigured(): boolean {
  return !!APIFY_TOKEN && APIFY_TOKEN.startsWith('apify_api_');
}

export function apifySetupInstructions() {
  return {
    title: 'Connect Apify',
    steps: [
      'Go to apify.com → Sign up (free, $5 credit included)',
      'Settings → Integrations → Personal API token → copy it',
      'Add APIFY_TOKEN to your Vercel env vars',
      'Redeploy — all Apify-backed intelligence sources light up',
      'Costs are pay-per-use: most scrapes are under $0.01 per run',
    ],
  };
}

type RunRecord = {
  id: string;
  status: 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMING-OUT' | 'TIMED-OUT' | 'ABORTING' | 'ABORTED';
  defaultDatasetId?: string;
};

async function apifyJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}token=${APIFY_TOKEN}`;
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = (json as { error?: { message?: string }; message?: string }).error?.message
      || (json as { message?: string }).message
      || `Apify ${res.status} on ${path}`;
    throw new Error(msg);
  }
  return json as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runActor<T = Record<string, unknown>>(
  actorId: string,
  input: Record<string, unknown>,
  options: ApifyRunOptions = {},
): Promise<ApifyResult<T>> {
  if (!isApifyConfigured()) {
    return {
      ok: false,
      actor: actorId,
      needsSetup: true,
      error: 'APIFY_TOKEN not set. Get a free token at apify.com.',
    };
  }

  const timeoutMs = (options.timeout ?? 55) * 1000;
  // Apify actor IDs can be "user~actor" (with ~) or a bare slug; both work URL-encoded.
  const actorPath = encodeURIComponent(actorId);

  try {
    // 1. Start the actor run
    const startRes = await apifyJson<{ data: RunRecord }>(
      `/acts/${actorPath}/runs`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
    const runId = startRes.data.id;

    // 2. Poll for completion
    const deadline = Date.now() + timeoutMs;
    let interval = 2000;
    let runRec = startRes.data;
    while (runRec.status !== 'SUCCEEDED' && Date.now() < deadline) {
      if (runRec.status === 'FAILED' || runRec.status === 'ABORTED' || runRec.status === 'TIMED-OUT') {
        return { ok: false, actor: actorId, error: `Apify run ${runRec.status.toLowerCase()}` };
      }
      await sleep(interval);
      interval = Math.min(Math.round(interval * 1.3), 8_000);
      const poll = await apifyJson<{ data: RunRecord }>(`/actor-runs/${runId}`);
      runRec = poll.data;
    }

    if (runRec.status !== 'SUCCEEDED') {
      return { ok: false, actor: actorId, error: `Apify run timed out after ${options.timeout ?? 55}s` };
    }
    if (!runRec.defaultDatasetId) {
      return { ok: false, actor: actorId, error: 'Apify run did not return a dataset.' };
    }

    // 3. Fetch dataset items
    const limit = options.maxItems ? `?limit=${options.maxItems}` : '';
    const items = await apifyJson<T[]>(`/datasets/${runRec.defaultDatasetId}/items${limit}`);
    return { ok: true, actor: actorId, items: items as T[] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Apify run failed';
    if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
      return { ok: false, actor: actorId, error: 'Invalid APIFY_TOKEN. Check your token at apify.com → Settings → Integrations.' };
    }
    return { ok: false, actor: actorId, error: msg };
  }
}

/**
 * Default actor IDs for each data source. Each can be overridden via
 * env var so you can swap in a different community actor.
 */
export const DEFAULT_ACTORS = {
  instagram: process.env.APIFY_INSTAGRAM_ACTOR || 'shu8hvrXbJbY3Eb9W',
  metaAds: process.env.APIFY_META_ADS_ACTOR || 'curious_coder/facebook-ads-library-scraper',
  tiktok: process.env.APIFY_TIKTOK_ACTOR || 'clockworks/free-tiktok-scraper',
  amazon: process.env.APIFY_AMAZON_ACTOR || 'junglee/Amazon-crawler',
  linkedinJobs: process.env.APIFY_LINKEDIN_JOBS_ACTOR || 'bebity/linkedin-jobs-scraper',
  linkedinCompany: process.env.APIFY_LINKEDIN_COMPANY_ACTOR || 'curious_coder/linkedin-company-scraper',
  pinterest: process.env.APIFY_PINTEREST_ACTOR || 'epctex/pinterest-scraper',
  googleShopping: process.env.APIFY_GOOGLE_SHOPPING_ACTOR || 'epctex/google-shopping-scraper',
  googleMaps: process.env.APIFY_GOOGLE_MAPS_ACTOR || 'compass/crawler-google-places',
  crunchbase: process.env.APIFY_CRUNCHBASE_ACTOR || 'epctex/crunchbase-scraper',
  youtube: process.env.APIFY_YOUTUBE_ACTOR || 'bernardo/youtube-scraper',
  reddit: process.env.APIFY_REDDIT_ACTOR || 'trudax/reddit-scraper',
};
