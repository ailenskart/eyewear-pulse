/**
 * Upstash Redis-backed rate limiting.
 *
 * If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are not set, rate
 * limiting is a no-op (returns { success: true } for every call). This
 * way local dev works without Upstash, and we fail open in production
 * if the Redis connection hiccups.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = UPSTASH_URL && UPSTASH_TOKEN
  ? new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN })
  : null;

/** Standard limiter — 60 requests per minute per key. */
export const rateLimitStandard = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, '60 s'),
      prefix: 'lenzy:rl:standard',
    })
  : null;

/** Hot-path limiter for /api/v1/feed + /content — 120 per minute. */
export const rateLimitFeed = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, '60 s'),
      prefix: 'lenzy:rl:feed',
    })
  : null;

/** Expensive limiter for AI / reimagine / Apify — 20 per minute. */
export const rateLimitAI = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, '60 s'),
      prefix: 'lenzy:rl:ai',
    })
  : null;

export type Limiter = typeof rateLimitStandard;

/** Fail-open helper — returns { success: true } when no Redis. */
export async function checkLimit(
  limiter: Limiter,
  key: string,
): Promise<{ success: boolean; limit?: number; remaining?: number; reset?: number }> {
  if (!limiter) return { success: true };
  try {
    return await limiter.limit(key);
  } catch {
    return { success: true };
  }
}
