-- v9 bundle schema (Drive drop): celebrities + extended tracked_brands
--
-- Run in Supabase → SQL editor → New query → paste → Run.
-- Idempotent (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS).
--
-- After running, hit /api/admin/import-v9?key=…&kind=celebrities
-- and /api/admin/import-v9?key=…&kind=companies in a loop with
-- limit=500&offset=0,500,1000,... until nextOffset is null.

-- ─── CELEBRITIES ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS celebrities (
  id bigserial PRIMARY KEY,
  uuid text UNIQUE NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  aliases text[] DEFAULT '{}',
  region text,
  country text,
  category text,
  gender text,
  instagram_handle text,
  instagram_url text,
  instagram_followers bigint,
  twitter_handle text,
  youtube_handle text,
  tiktok_handle text,
  eyewear_affinity text,
  known_eyewear_brands text[] DEFAULT '{}',
  glasses_notes text,
  lenskart_relevance text,
  source text DEFAULT 'v9_bundle',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- If celebrities already existed with a different shape, add the
-- columns we need (each idempotent).
ALTER TABLE celebrities ADD COLUMN IF NOT EXISTS uuid text;
ALTER TABLE celebrities ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE celebrities ADD COLUMN IF NOT EXISTS aliases text[] DEFAULT '{}';
ALTER TABLE celebrities ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE celebrities ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE celebrities ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE celebrities ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE celebrities ADD COLUMN IF NOT EXISTS instagram_handle text;
ALTER TABLE celebrities ADD COLUMN IF NOT EXISTS instagram_url text;
ALTER TABLE celebrities ADD COLUMN IF NOT EXISTS instagram_followers bigint;
ALTER TABLE celebrities ADD COLUMN IF NOT EXISTS twitter_handle text;
ALTER TABLE celebrities ADD COLUMN IF NOT EXISTS youtube_handle text;
ALTER TABLE celebrities ADD COLUMN IF NOT EXISTS tiktok_handle text;
ALTER TABLE celebrities ADD COLUMN IF NOT EXISTS eyewear_affinity text;
ALTER TABLE celebrities ADD COLUMN IF NOT EXISTS known_eyewear_brands text[] DEFAULT '{}';
ALTER TABLE celebrities ADD COLUMN IF NOT EXISTS glasses_notes text;
ALTER TABLE celebrities ADD COLUMN IF NOT EXISTS lenskart_relevance text;
ALTER TABLE celebrities ADD COLUMN IF NOT EXISTS source text;

CREATE UNIQUE INDEX IF NOT EXISTS celebrities_uuid_key ON celebrities (uuid);
CREATE INDEX IF NOT EXISTS celebrities_slug_idx ON celebrities (slug);
CREATE INDEX IF NOT EXISTS celebrities_ig_handle_idx ON celebrities (instagram_handle) WHERE instagram_handle IS NOT NULL;
CREATE INDEX IF NOT EXISTS celebrities_region_idx ON celebrities (region);
CREATE INDEX IF NOT EXISTS celebrities_category_idx ON celebrities (category);

-- ─── EXTEND tracked_brands for v9 richness ─────────────────────

ALTER TABLE tracked_brands ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE tracked_brands ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE tracked_brands ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE tracked_brands ADD COLUMN IF NOT EXISTS followers_count bigint;
ALTER TABLE tracked_brands ADD COLUMN IF NOT EXISTS tier text;
ALTER TABLE tracked_brands ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE tracked_brands ADD COLUMN IF NOT EXISTS data jsonb DEFAULT '{}'::jsonb;
-- last-scrape bookkeeping referenced by the Mindcase + Apify crons
ALTER TABLE tracked_brands ADD COLUMN IF NOT EXISTS last_scraped_at timestamptz;

CREATE INDEX IF NOT EXISTS tracked_brands_tier_idx ON tracked_brands (tier);
CREATE INDEX IF NOT EXISTS tracked_brands_active_idx ON tracked_brands (active);
CREATE INDEX IF NOT EXISTS tracked_brands_followers_idx ON tracked_brands (followers_count DESC NULLS LAST);
