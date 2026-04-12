/**
 * Apify SDK helper — uses the official `apify-client` package.
 *
 * Runs any Apify actor, waits for completion, and returns
 * the dataset items. Perfect for serverless functions.
 *
 * Usage:
 *   const { ok, items } = await runActor('shu8hvrXbJbY3Eb9W', {
 *     directUrls: ['https://instagram.com/lenskart'],
 *     resultsType: 'posts',
 *     resultsLimit: 25,
 *   });
 *
 * Requires APIFY_TOKEN env var. Free $5 credit on signup.
 */

import { ApifyClient } from 'apify-client';

const APIFY_TOKEN = process.env.APIFY_TOKEN || '';

let _client: ApifyClient | null = null;
function getClient(): ApifyClient {
  if (!_client) _client = new ApifyClient({ token: APIFY_TOKEN });
  return _client;
}

export interface ApifyRunOptions {
  timeout?: number;       // max seconds to wait (default 55)
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

  try {
    const client = getClient();
    const timeoutSecs = options.timeout ?? 55;

    // Run the actor and wait for it to finish
    const run = await client.actor(actorId).call(input, {
      waitSecs: timeoutSecs,
      ...(options.memoryMbytes ? { memoryMbytes: options.memoryMbytes } : {}),
    });

    if (!run || !run.defaultDatasetId) {
      return { ok: false, actor: actorId, error: 'Actor run did not return a dataset.' };
    }

    // Fetch results from the dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems({
      limit: options.maxItems,
    });

    return { ok: true, actor: actorId, items: (items || []) as T[] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Apify run failed';
    // Check for common errors
    if (msg.includes('401') || msg.includes('Unauthorized')) {
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
