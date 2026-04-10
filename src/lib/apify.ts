/**
 * Apify SDK-less helper.
 *
 * Runs any Apify actor via the `run-sync-get-dataset-items` endpoint
 * which blocks until the actor completes (or times out) and returns
 * the dataset items directly — perfect for serverless.
 *
 * Usage:
 *   const { ok, items, error } = await runActor('apify/instagram-scraper', {
 *     directUrls: ['https://instagram.com/lenskart'],
 *     resultsLimit: 10,
 *   });
 *
 * Actor IDs can be:
 *   - 'username/actor-name' (slug format)
 *   - 'username~actor-name' (URL-safe format)
 * Both are accepted here — we normalize to `~`.
 *
 * Pricing: each actor costs Apify credits. Typical scrape runs $0.25–$2
 * per 1000 results. Requires APIFY_TOKEN env var (free $5/mo credit on
 * signup at apify.com).
 */

const APIFY_TOKEN = process.env.APIFY_TOKEN || '';

export interface ApifyRunOptions {
  timeout?: number;       // max seconds to wait (default 55, Vercel serverless cap)
  memoryMbytes?: number;  // actor memory — more = faster but costs more
  maxItems?: number;      // hard cap on dataset items returned
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
      'Go to apify.com → Sign up (free, $5 credit/month included)',
      'Settings → Integrations → Personal API token → copy it',
      'Add APIFY_TOKEN to your Vercel env vars',
      'Redeploy — all Apify-backed intelligence sources light up',
      'Costs are pay-per-use: most scrapes are under $0.01 per run',
    ],
  };
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
      error: 'APIFY_TOKEN not set. Get a free token at apify.com (signup gives $5/mo credit).',
    };
  }

  const safeActorId = actorId.replace('/', '~');
  const url = new URL(`https://api.apify.com/v2/acts/${safeActorId}/run-sync-get-dataset-items`);
  url.searchParams.set('token', APIFY_TOKEN);
  url.searchParams.set('timeout', String(options.timeout ?? 55));
  if (options.memoryMbytes) url.searchParams.set('memory', String(options.memoryMbytes));
  if (options.maxItems) url.searchParams.set('limit', String(options.maxItems));

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      let msg = `Apify actor ${actorId} returned HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(txt);
        msg = parsed?.error?.message || parsed?.error || msg;
      } catch { /* non-JSON body */ }
      return { ok: false, actor: actorId, error: msg };
    }

    const items = (await res.json()) as T[];
    return { ok: true, actor: actorId, items: Array.isArray(items) ? items : [] };
  } catch (err) {
    return {
      ok: false,
      actor: actorId,
      error: err instanceof Error ? err.message : 'Apify fetch failed',
    };
  }
}

/**
 * Default actor IDs for each data source. Each can be overridden via
 * env var so you can swap in a different community actor if one
 * breaks or you find a better one.
 */
export const DEFAULT_ACTORS = {
  instagram: process.env.APIFY_INSTAGRAM_ACTOR || 'apify/instagram-scraper',
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
