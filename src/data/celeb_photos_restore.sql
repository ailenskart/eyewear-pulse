-- Restore celeb_photos from the _legacy rename done in Phase 1.
--
-- The Phase 1 schema hardening renamed celeb_photos → celeb_photos_legacy
-- with the intent to migrate scanner output to brand_content. That
-- migration never shipped, so both the /api/celebrities/instagram
-- scanner and /api/celebrities/feed point at celeb_photos which no
-- longer exists — every detected eyewear photo was silently 404ing on
-- insert.
--
-- This migration either renames the legacy table back (preserving all
-- historical rows) OR, if both are missing, creates the table fresh
-- with the columns the scanner and feed expect.
--
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/adrisbzrtlkoeqmzkbsz/sql/new

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'celeb_photos'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'celeb_photos_legacy'
    ) THEN
      EXECUTE 'ALTER TABLE celeb_photos_legacy RENAME TO celeb_photos';
    ELSE
      CREATE TABLE celeb_photos (
        id text PRIMARY KEY,
        celeb_name text NOT NULL,
        celeb_slug text NOT NULL,
        celeb_category text,
        celeb_country text,
        image_url text NOT NULL,
        blob_url text,
        thumb_url text,
        page_url text,
        source text,
        source_type text,
        caption text,
        eyewear_type text,
        detected_at timestamptz DEFAULT now(),
        likes int DEFAULT 0,
        comments int DEFAULT 0,
        posted_at timestamptz,
        vision_confidence numeric,
        brand_id int,
        brand_handle text
      );
    END IF;
  END IF;
END
$$;

-- Helpful indexes for the feed query shapes
CREATE INDEX IF NOT EXISTS celeb_photos_slug_idx     ON celeb_photos (celeb_slug);
CREATE INDEX IF NOT EXISTS celeb_photos_category_idx ON celeb_photos (celeb_category);
CREATE INDEX IF NOT EXISTS celeb_photos_country_idx  ON celeb_photos (celeb_country);
CREATE INDEX IF NOT EXISTS celeb_photos_detected_idx ON celeb_photos (detected_at DESC);
CREATE INDEX IF NOT EXISTS celeb_photos_eyewear_idx  ON celeb_photos (eyewear_type);

-- Scanner bookkeeping table (used by the cron to rotate through
-- least-recently-scanned celebs). Harmless to re-run.
CREATE TABLE IF NOT EXISTS celeb_scan_log (
  id bigserial PRIMARY KEY,
  celeb_name text NOT NULL,
  celeb_slug text NOT NULL,
  scanned_at timestamptz DEFAULT now(),
  detected int DEFAULT 0,
  total_scanned int DEFAULT 0,
  source text,
  error text
);
CREATE INDEX IF NOT EXISTS celeb_scan_log_slug_idx    ON celeb_scan_log (celeb_slug);
CREATE INDEX IF NOT EXISTS celeb_scan_log_scanned_idx ON celeb_scan_log (scanned_at DESC);
