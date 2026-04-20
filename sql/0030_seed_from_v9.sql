-- =============================================================================
-- 0030_seed_from_v9.sql
-- Lenzy v2 · Seed data from v9 cleaned datasets
--
-- Loads:
--   1. tracked_brands from companies_v9_tracked_brands.csv
--   2. directory_celebrities from celebrities_v9.csv
--
-- ─────────────────────────────────────────────────────────────────────────────
-- HOW TO RUN
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A) LOCAL / SELF-HOSTED POSTGRES (psql):
--    Use \copy (client-side) — psql reads the file on the CLIENT machine.
--    The paths below assume you run psql from the repo root.
--
--    psql "$DATABASE_URL" \
--         -c "\copy tracked_brands(...) FROM 'data/companies_v9_tracked_brands.csv' CSV HEADER"
--    psql "$DATABASE_URL" \
--         -c "\copy directory_celebrities(...) FROM 'data/celebrities_v9.csv' CSV HEADER"
--
-- B) SUPABASE (hosted) — Supabase SQL Editor does NOT support \copy or COPY FROM file.
--    Use the Supabase Dashboard → Table Editor → Import CSV button instead,
--    or use the Supabase CLI:
--
--    supabase db reset        # applies all migrations first
--    supabase seed            # if you add this file to supabase/seed.sql
--
--    Alternatively, use psql with the direct connection string from
--    Supabase Project Settings → Database → Connection string (URI mode):
--
--    PGPASSWORD=<password> psql \
--        "postgresql://postgres.<project-ref>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
--        -f supabase/migrations/0030_seed_from_v9.sql
--
--    Then run the \copy commands separately (they are client-side commands).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE ON COPY vs \copy
-- ─────────────────────────────────────────────────────────────────────────────
--   COPY (server-side) requires the file to be on the DB server filesystem.
--     → Use this only for local Docker/Postgres setups.
--   \copy (client-side) reads the file on the machine running psql.
--     → Use this for remote Supabase connections.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. tracked_brands seed
-- ---------------------------------------------------------------------------

-- Supabase Import UI / \copy syntax (run from psql client):
-- \copy tracked_brands (
--     handle, name, country, iso_alpha2, iso_alpha3, region, hq_city,
--     category, subcategory, business_type, business_model, price_tier,
--     founded_year, ownership_type, is_public, stock_ticker, website,
--     instagram_url, linkedin_url, facebook_url, youtube_url,
--     tiktok_url, instagram_followers, employee_estimate, store_estimate,
--     revenue_usd_estimate, naics_code, sic_code,
--     is_d2c, is_manufacturer, is_retailer, is_luxury,
--     is_smart_eyewear, has_manufacturing, sustainability_focus,
--     description, tags, completeness_pct, confidence_pct, needs_reverification
-- )
-- FROM '/absolute/path/to/lenzy_v9/data/companies_v9_tracked_brands.csv'
-- WITH (FORMAT csv, HEADER true, NULL '');

-- Server-side COPY alternative (local Postgres with file on server):
-- COPY tracked_brands (
--     handle, name, country, iso_alpha2, iso_alpha3, region, hq_city,
--     category, subcategory, business_type, business_model, price_tier,
--     founded_year, ownership_type, is_public, stock_ticker, website,
--     instagram_url, linkedin_url, facebook_url, youtube_url,
--     tiktok_url, instagram_followers, employee_estimate, store_estimate,
--     revenue_usd_estimate, naics_code, sic_code,
--     is_d2c, is_manufacturer, is_retailer, is_luxury,
--     is_smart_eyewear, has_manufacturing, sustainability_focus,
--     description, tags, completeness_pct, confidence_pct, needs_reverification
-- )
-- FROM '/home/user/workspace/lenzy_v9/data/companies_v9_tracked_brands.csv'
-- WITH (FORMAT csv, HEADER true, NULL '');

-- After importing, populate the tiktok_url column from tiktok_handle values:
UPDATE tracked_brands
   SET tiktok_url = 'https://tiktok.com/@' || tiktok_url
 WHERE tiktok_url IS NOT NULL
   AND tiktok_url NOT LIKE 'https://%';

-- Populate instagram_url if only handle was present:
UPDATE tracked_brands
   SET instagram_url = 'https://instagram.com/' || handle
 WHERE instagram_url IS NULL
   AND handle IS NOT NULL;

-- Populate iso_code (legacy field) from iso_alpha3 for backward compat:
UPDATE tracked_brands
   SET iso_code = iso_alpha3
 WHERE iso_code IS NULL
   AND iso_alpha3 IS NOT NULL;

-- Force completeness recompute after bulk load
-- (trigger fires on UPDATE; a no-op UPDATE touches all rows)
UPDATE tracked_brands SET updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. directory_celebrities seed
-- ---------------------------------------------------------------------------
-- Expected CSV columns for celebrities_v9.csv:
--   name, aliases, slug, region, country, iso_alpha2, category, gender,
--   instagram_handle, instagram_url, instagram_followers_estimate,
--   instagram_verified, twitter_handle, tiktok_handle, youtube_handle,
--   eyewear_affinity, known_eyewear_brands, glasses_notes, lenskart_relevance,
--   scan_enabled, scan_frequency_hours, data_quality, provenance
--
-- (This file is produced by the celebrity subagent. If it does not exist yet,
--  skip this section and import manually once the file lands.)

-- \copy directory_celebrities (
--     name, aliases, slug, region, country, iso_alpha2, category, gender,
--     instagram_handle, instagram_url, instagram_followers_estimate,
--     instagram_verified, twitter_handle, tiktok_handle, youtube_handle,
--     eyewear_affinity, known_eyewear_brands, glasses_notes, lenskart_relevance,
--     scan_enabled, scan_frequency_hours, data_quality, provenance
-- )
-- FROM '/absolute/path/to/lenzy_v9/data/celebrities_v9.csv'
-- WITH (FORMAT csv, HEADER true, NULL '');

-- Server-side COPY alternative:
-- COPY directory_celebrities (
--     name, aliases, slug, region, country, iso_alpha2, category, gender,
--     instagram_handle, instagram_url, instagram_followers_estimate,
--     instagram_verified, twitter_handle, tiktok_handle, youtube_handle,
--     eyewear_affinity, known_eyewear_brands, glasses_notes, lenskart_relevance,
--     scan_enabled, scan_frequency_hours, data_quality, provenance
-- )
-- FROM '/home/user/workspace/lenzy_v9/data/celebrities_v9.csv'
-- WITH (FORMAT csv, HEADER true, NULL '');

-- After celebrity import, backfill slugs for any rows missing them:
UPDATE directory_celebrities
   SET slug = slugify(name)
 WHERE slug IS NULL OR slug = '';

-- ---------------------------------------------------------------------------
-- 3. Post-seed verification queries (run manually to confirm load)
-- ---------------------------------------------------------------------------

-- SELECT count(*) AS brand_count FROM tracked_brands;
-- -- Expected: ~3068

-- SELECT count(*) AS celeb_count FROM directory_celebrities;

-- SELECT completeness_pct, count(*)
--   FROM tracked_brands
--  GROUP BY completeness_pct
--  ORDER BY completeness_pct DESC
--  LIMIT 10;

-- SELECT region, count(*) AS n
--   FROM tracked_brands
--  GROUP BY region
--  ORDER BY n DESC;

-- SELECT category, count(*) AS n
--   FROM directory_celebrities
--  GROUP BY category
--  ORDER BY n DESC;
