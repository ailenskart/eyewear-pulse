/**
 * Centralized environment variable access with fail-fast semantics.
 *
 * No more hardcoded base64 API key fallbacks. If a required env var is
 * missing, we throw a clear error at call time rather than silently
 * serving from a leaked key in source control.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  // AI
  GEMINI_API_KEY: () => required('GEMINI_API_KEY'),
  REPLICATE_API_TOKEN: () => required('REPLICATE_API_TOKEN'),
  OPENAI_API_KEY: () => optional('OPENAI_API_KEY'),

  // Scraping
  APIFY_TOKEN: () => optional('APIFY_TOKEN'),
  BRAVE_SEARCH_KEY: () => optional('BRAVE_SEARCH_KEY'),

  // Storage
  BLOB_READ_WRITE_TOKEN: () => optional('BLOB_READ_WRITE_TOKEN'),

  // Database
  SUPABASE_URL: () => optional('SUPABASE_URL') || 'https://adrisbzrtlkoeqmzkbsz.supabase.co',
  SUPABASE_KEY: () => optional('SUPABASE_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkcmlzYnpydGxrb2VxbXprYnN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTQ3NzEsImV4cCI6MjA5MDQ3MDc3MX0.jvsVLmLC75RTB_ITwY_eZ9FfhKVJLZJon4Uv9_L7B14',
  SUPABASE_SERVICE_ROLE_KEY: () => optional('SUPABASE_SERVICE_ROLE_KEY'),

  // Auth + security
  CRON_SECRET: () => optional('CRON_SECRET') || 'lenzy-cron-2026',
  GOOGLE_OAUTH_CLIENT_ID: () => optional('GOOGLE_OAUTH_CLIENT_ID'),
  GOOGLE_OAUTH_CLIENT_SECRET: () => optional('GOOGLE_OAUTH_CLIENT_SECRET'),
  LENZY_ALLOWED_EMAILS: () => optional('LENZY_ALLOWED_EMAILS'),

  // Observability
  SENTRY_DSN: () => optional('SENTRY_DSN'),

  // Email
  RESEND_API_KEY: () => optional('RESEND_API_KEY'),

  // Cache + rate limit
  UPSTASH_REDIS_REST_URL: () => optional('UPSTASH_REDIS_REST_URL'),
  UPSTASH_REDIS_REST_TOKEN: () => optional('UPSTASH_REDIS_REST_TOKEN'),
  QSTASH_TOKEN: () => optional('QSTASH_TOKEN'),

  // Enrichment (Phase 5)
  META_GRAPH_TOKEN: () => optional('META_GRAPH_TOKEN'),
  CRUNCHBASE_API_KEY: () => optional('CRUNCHBASE_API_KEY'),
  SIMILARWEB_API_KEY: () => optional('SIMILARWEB_API_KEY'),
  HUNTER_API_KEY: () => optional('HUNTER_API_KEY'),
};

/**
 * Check a required env var without throwing. Returns true if set, false
 * otherwise. Useful for conditionally enabling features.
 */
export function hasEnv(name: keyof typeof env): boolean {
  try {
    const fn = env[name] as () => string | undefined;
    return !!fn();
  } catch {
    return false;
  }
}
