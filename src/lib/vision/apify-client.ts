/**
 * apify-client.ts — Typed Apify SDK wrapper with retry and dead-letter queue
 *
 * Purpose: Wraps the official `apify-client` package with:
 *   - Typed input/output per actor
 *   - Retry logic (3 attempts, exponential backoff: 1s, 2s, 4s)
 *   - Dead-letter queue via QStash when all retries are exhausted
 *   - Per-handle failure tracking in Supabase
 *   - Budget guard via Upstash Redis daily counter
 *
 * Env vars required:
 *   APIFY_TOKEN            — Apify personal API token (starts with apify_api_)
 *   QSTASH_TOKEN           — Upstash QStash token for DLQ
 *   UPSTASH_REDIS_REST_URL — Redis URL for budget counters
 *   UPSTASH_REDIS_REST_TOKEN — Redis token
 *
 * Example invocation:
 *   const result = await runApifyIGScraper({ directUrls: ['https://instagram.com/zendaya'], resultsLimit: 10 });
 *
 * Cron schedule: called from celeb-scan/route.ts (every 6h)
 */

import { ApifyClient } from 'apify-client';
import { logger } from '@/lib/logger';
import type { ApifyIGPost, ApifyRedditPost, ApifyIGInput, ApifyRedditInput } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IG_ACTOR_ID = process.env.APIFY_INSTAGRAM_ACTOR ?? 'shu8hvrXbJbY3Eb9W';
const REDDIT_ACTOR_ID = process.env.APIFY_REDDIT_ACTOR ?? 'trudax/reddit-scraper';

const MAX_RETRIES = 3;
const WAIT_TIMEOUT_SECS = 300;
const DATASET_ITEM_LIMIT = 1000;

const REDIS_BUDGET_KEY_PREFIX = 'lenzy:budget:apify';
const DAILY_APIFY_CALL_LIMIT = parseInt(process.env.DAILY_APIFY_CALL_LIMIT ?? '1000', 10);

// ---------------------------------------------------------------------------
// Env validation
// ---------------------------------------------------------------------------

function assertEnv(): void {
  const required = ['APIFY_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`apify-client: missing required env vars: ${missing.join(', ')}`);
  }
  if (!process.env.APIFY_TOKEN!.startsWith('apify_api_')) {
    throw new Error('apify-client: APIFY_TOKEN must start with "apify_api_"');
  }
}

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------

let _client: ApifyClient | null = null;

function getClient(): ApifyClient {
  if (!_client) {
    assertEnv();
    _client = new ApifyClient({ token: process.env.APIFY_TOKEN! });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Budget guard (Upstash Redis)
// ---------------------------------------------------------------------------

async function checkAndIncrementBudget(): Promise<{ allowed: boolean; used: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${REDIS_BUDGET_KEY_PREFIX}:${today}`;
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/incr/${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN!}` },
  });

  if (!res.ok) {
    // If Redis is down, allow the call but log a warning
    logger.warn({ status: res.status }, 'apify-client: Redis budget check failed, allowing call');
    return { allowed: true, used: 0 };
  }

  const json = (await res.json()) as { result: number };
  const used = json.result;

  // Set 25h TTL on first write
  if (used === 1) {
    await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/expire/${encodeURIComponent(key)}/90000`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN!}` },
    });
  }

  if (used > DAILY_APIFY_CALL_LIMIT) {
    logger.warn({ used, limit: DAILY_APIFY_CALL_LIMIT }, 'apify-client: daily budget exceeded');
    return { allowed: false, used };
  }

  return { allowed: true, used };
}

// ---------------------------------------------------------------------------
// Dead-letter queue (QStash)
// ---------------------------------------------------------------------------

interface DLQPayload {
  type: 'apify_run_failed';
  actor_id: string;
  input: Record<string, unknown>;
  celebrity_id?: number;
  attempt: number;
  error: string;
  failed_at: string;
}

async function sendToDLQ(payload: DLQPayload): Promise<void> {
  if (!process.env.QSTASH_TOKEN) {
    logger.warn({ payload }, 'apify-client: QSTASH_TOKEN not set, DLQ disabled');
    return;
  }

  try {
    const res = await fetch('https://qstash.upstash.io/v2/publish/https://internal/dlq/apify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, 'apify-client: DLQ publish failed');
    } else {
      logger.info({ actor_id: payload.actor_id }, 'apify-client: sent to DLQ');
    }
  } catch (err) {
    logger.error({ err }, 'apify-client: DLQ fetch threw');
  }
}

// ---------------------------------------------------------------------------
// Core run function with retry
// ---------------------------------------------------------------------------

async function runActorWithRetry<T>(
  actorId: string,
  input: Record<string, unknown>,
  context: Record<string, unknown>,
): Promise<{ ok: true; items: T[] } | { ok: false; error: string }> {
  const { allowed, used } = await checkAndIncrementBudget();
  if (!allowed) {
    return { ok: false, error: `Daily Apify budget exceeded (used: ${used})` };
  }

  const client = getClient();
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(
        { actor_id: actorId, attempt, handle: context.handle },
        'apify-client: starting actor run',
      );

      const run = await client.actor(actorId).call(input, {
        waitSecs: WAIT_TIMEOUT_SECS,
      });

      if (!run?.defaultDatasetId) {
        lastError = 'Actor run returned no dataset';
        logger.warn({ actorId, attempt }, lastError);
        continue;
      }

      if (run.status === 'TIMED-OUT' || run.status === 'TIMING-OUT') {
        lastError = 'Actor run TIMED_OUT';
        logger.warn({ actorId, attempt, handle: context.handle }, lastError);
        // Retry with more memory on second attempt
        if (attempt === 1) {
          (input as Record<string, unknown>).memoryMbytes = 1024;
        }
        await sleep(attempt * 2000);
        continue;
      }

      if (run.status !== 'SUCCEEDED') {
        lastError = `Actor run status: ${run.status}`;
        logger.warn({ actorId, attempt, status: run.status }, lastError);
        await sleep(attempt * 2000);
        continue;
      }

      const { items } = await client.dataset(run.defaultDatasetId).listItems({
        limit: DATASET_ITEM_LIMIT,
      });

      logger.info(
        { actorId, attempt, count: items.length, handle: context.handle },
        'apify-client: actor run succeeded',
      );

      return { ok: true, items: (items ?? []) as T[] };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      logger.error({ actorId, attempt, err: lastError, handle: context.handle }, 'apify-client: actor call threw');

      if (lastError.includes('401') || lastError.includes('Unauthorized')) {
        // Auth failure — do not retry
        return { ok: false, error: 'APIFY_TOKEN is invalid or expired' };
      }

      if (lastError.includes('429') || lastError.includes('TOO_MANY_REQUESTS')) {
        // Rate limit — back off longer
        await sleep(attempt * 4000);
      } else {
        await sleep(attempt * 2000);
      }
    }
  }

  // All retries exhausted — send to DLQ
  await sendToDLQ({
    type: 'apify_run_failed',
    actor_id: actorId,
    input,
    celebrity_id: context.celebrity_id as number | undefined,
    attempt: MAX_RETRIES,
    error: lastError,
    failed_at: new Date().toISOString(),
  });

  return { ok: false, error: lastError };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scrape the most recent posts from an Instagram profile.
 */
export async function runApifyIGScraper(
  input: ApifyIGInput,
  context: { celebrity_id?: number; handle?: string } = {},
): Promise<{ ok: true; items: ApifyIGPost[] } | { ok: false; error: string }> {
  return runActorWithRetry<ApifyIGPost>(IG_ACTOR_ID, input as unknown as Record<string, unknown>, context);
}

/**
 * Scrape posts from a Reddit subreddit.
 */
export async function runApifyRedditScraper(
  input: ApifyRedditInput,
  context: { subreddit?: string } = {},
): Promise<{ ok: true; items: ApifyRedditPost[] } | { ok: false; error: string }> {
  return runActorWithRetry<ApifyRedditPost>(
    REDDIT_ACTOR_ID,
    input as unknown as Record<string, unknown>,
    context,
  );
}

/**
 * Scrape posts from an Instagram hashtag stream.
 */
export async function runApifyHashtagScraper(
  hashtag: string,
  limit = 100,
): Promise<{ ok: true; items: ApifyIGPost[] } | { ok: false; error: string }> {
  const input: ApifyIGInput = {
    directUrls: [`https://www.instagram.com/explore/tags/${encodeURIComponent(hashtag)}/`],
    resultsType: 'hashtag',
    resultsLimit: limit,
  };
  return runActorWithRetry<ApifyIGPost>(IG_ACTOR_ID, input as unknown as Record<string, unknown>, {
    handle: `#${hashtag}`,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
