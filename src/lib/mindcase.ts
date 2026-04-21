/**
 * Thin client for the Mindcase data-collection API (docs.mindcase.co).
 *
 * The API is job-based:
 *   1. POST /agents/{group}/{slug}/run  → returns job_id
 *   2. GET  /jobs/{job_id}              → poll until status=completed
 *   3. GET  /jobs/{job_id}/results      → fetch structured data
 *
 * Auth: Authorization: Bearer mk_live_...
 *
 * We use Mindcase as a second source for Instagram (+ LinkedIn, YouTube,
 * TikTok, Reddit, Twitter) alongside Apify. Mindcase charges per row,
 * not per-run, so small batches are cheap.
 */

import { env } from './env';

const BASE_URL = 'https://api.mindcase.co/api/v1';

export type MindcaseJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface MindcaseJob {
  job_id: string;
  status: MindcaseJobStatus;
  agent?: string;
  row_count?: number;
  credits_used?: number;
  error?: string;
  expires_at?: string;
}

export interface MindcaseResults<T = Record<string, unknown>> {
  status: MindcaseJobStatus;
  row_count: number;
  data: T[];
  credits_used?: number;
}

function apiKey(): string {
  const k = env.MINDCASE_API_KEY();
  if (!k) throw new Error('MINDCASE_API_KEY not set');
  return k;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = (json as { error?: string; message?: string }).error
      || (json as { message?: string }).message
      || `Mindcase ${res.status} on ${path}`;
    throw new Error(msg);
  }
  return json as T;
}

/** Start a new agent run. Returns the job immediately (status=queued/running). */
export async function runAgentAsync(
  agent: string,
  params: Record<string, unknown>,
): Promise<MindcaseJob> {
  // agent is expected in the form "instagram/posts"
  const [group, slug] = agent.split('/');
  if (!group || !slug) throw new Error(`Invalid agent identifier: ${agent}`);
  return request<MindcaseJob>(`/agents/${group}/${slug}/run`, {
    method: 'POST',
    body: JSON.stringify({ params }),
  });
}

export async function getJob(jobId: string): Promise<MindcaseJob> {
  return request<MindcaseJob>(`/jobs/${jobId}`);
}

export async function getJobResults<T = Record<string, unknown>>(
  jobId: string,
): Promise<MindcaseResults<T>> {
  return request<MindcaseResults<T>>(`/jobs/${jobId}/results`);
}

export interface RunAgentOptions {
  /** Max seconds to wait before giving up. Default 600. */
  timeoutSec?: number;
  /** Start polling interval in ms. Default 2000. Backs off up to 15s. */
  initialPollMs?: number;
}

/**
 * Run an agent synchronously — kicks off the job, polls until it
 * completes (or fails / times out), then returns the results.
 */
export async function runAgent<T = Record<string, unknown>>(
  agent: string,
  params: Record<string, unknown>,
  opts: RunAgentOptions = {},
): Promise<MindcaseResults<T>> {
  const timeoutMs = (opts.timeoutSec ?? 600) * 1000;
  const start = Date.now();
  let interval = opts.initialPollMs ?? 2000;

  const job = await runAgentAsync(agent, params);

  while (Date.now() - start < timeoutMs) {
    await sleep(interval);
    interval = Math.min(interval * 1.3, 15_000);

    const status = await getJob(job.job_id);
    if (status.status === 'completed') {
      return getJobResults<T>(job.job_id);
    }
    if (status.status === 'failed' || status.status === 'cancelled') {
      throw new Error(`Mindcase job ${job.job_id} ${status.status}: ${status.error || 'no error message'}`);
    }
  }
  throw new Error(`Mindcase job ${job.job_id} timed out after ${opts.timeoutSec ?? 600}s`);
}

export async function getCredits(): Promise<number> {
  const res = await request<{ credits_remaining: number }>(`/credits`);
  return res.credits_remaining;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function isMindcaseConfigured(): boolean {
  try { apiKey(); return true; } catch { return false; }
}

/* ─── Instagram-specific row shapes ─── */
/* Mindcase docs show abbreviated samples; we accept both snake_case
   (Mindcase native) and camelCase (Apify-style) fields since the
   underlying scraper is likely a shared actor. */

export interface MindcaseIgPost {
  // Identity
  id?: string;
  shortCode?: string;
  shortcode?: string;
  // Owner
  ownerUsername?: string;
  owner_username?: string;
  username?: string;
  ownerFullName?: string;
  full_name?: string;
  // Content
  caption?: string;
  url?: string;
  post_url?: string;
  timestamp?: string;
  posted_at?: string;
  // Engagement
  likesCount?: number;
  likes?: number;
  likes_count?: number;
  commentsCount?: number;
  comments?: number;
  comments_count?: number;
  // Media
  displayUrl?: string;
  display_url?: string;
  media_url?: string;
  images?: string[];
  videoUrl?: string;
  video_url?: string;
  type?: string;
  // Carousel
  childPosts?: Array<{ id?: string; type?: string; displayUrl?: string; videoUrl?: string }>;
  child_posts?: Array<{ id?: string; type?: string; display_url?: string; video_url?: string }>;
  // Hashtags / mentions
  hashtags?: string[];
  mentions?: string[];
  location?: string | null;
}

export interface MindcaseIgProfile {
  username?: string;
  full_name?: string;
  fullName?: string;
  bio?: string;
  followers?: number;
  followersCount?: number;
  following?: number;
  followingCount?: number;
  posts?: number;
  postsCount?: number;
  verified?: boolean;
  isVerified?: boolean;
  private_account?: boolean;
  isPrivate?: boolean;
  website?: string;
  externalUrl?: string;
  profile_url?: string;
  profile_pic_url?: string;
  profilePicUrl?: string;
}
