-- =============================================================================
-- 0004_directory_celebrities.sql
-- Lenzy v2 · Celebrity / influencer master table
--
-- New table for Phase 4 vision moat. Stores celebrities whose eyewear
-- appearances are detected and attributed via the vision pipeline.
-- Idempotent: uses CREATE TABLE IF NOT EXISTS.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS directory_celebrities CASCADE;
-- =============================================================================

CREATE TABLE IF NOT EXISTS directory_celebrities (

    -- Primary key
    id                          bigserial       PRIMARY KEY,
    uuid                        uuid            NOT NULL DEFAULT gen_random_uuid(),

    -- Identity
    name                        text            NOT NULL,
    aliases                     text[]          NOT NULL DEFAULT '{}',
    slug                        text,           -- URL slug, unique (populated by trigger)

    -- Geography
    region                      text,           -- North America / Europe / APAC / etc.
    country                     text,
    iso_alpha2                  char(2),

    -- Classification
    category                    text,           -- Actor / Athlete / Musician / Model / Influencer / …
    gender                      text,

    -- Primary social: Instagram
    instagram_handle            text,
    instagram_url               text,
    instagram_followers_estimate bigint,
    instagram_verified          boolean         NOT NULL DEFAULT false,

    -- Other social handles (store handle only, not full URL — easier to construct)
    twitter_handle              text,
    tiktok_handle               text,
    youtube_handle              text,

    -- Eyewear intelligence
    eyewear_affinity            text            NOT NULL DEFAULT 'unknown'
                                                CHECK (eyewear_affinity IN (
                                                    'high', 'medium', 'low', 'unknown'
                                                )),
    known_eyewear_brands        text[]          NOT NULL DEFAULT '{}',
    glasses_notes               text,           -- free-text notes on style / prescription / etc.
    lenskart_relevance          text,           -- editor-authored note on Lenskart fit

    -- Scan scheduling
    scan_enabled                boolean         NOT NULL DEFAULT true,
    last_scanned_at             timestamptz,
    scan_frequency_hours        int             NOT NULL DEFAULT 168, -- weekly

    -- Data quality / provenance
    data_quality                jsonb           DEFAULT '{}'::jsonb,
    provenance                  jsonb           DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    updated_at                  timestamptz     NOT NULL DEFAULT now()

);

-- ---------------------------------------------------------------------------
-- Unique constraints
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_directory_celebrities_uuid'
          AND conrelid = 'directory_celebrities'::regclass
    ) THEN
        ALTER TABLE directory_celebrities
            ADD CONSTRAINT uq_directory_celebrities_uuid UNIQUE (uuid);
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_directory_celebrities_slug'
          AND conrelid = 'directory_celebrities'::regclass
    ) THEN
        ALTER TABLE directory_celebrities
            ADD CONSTRAINT uq_directory_celebrities_slug
            UNIQUE NULLS NOT DISTINCT (slug);
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_directory_celebrities_instagram_handle'
          AND conrelid = 'directory_celebrities'::regclass
    ) THEN
        ALTER TABLE directory_celebrities
            ADD CONSTRAINT uq_directory_celebrities_instagram_handle
            UNIQUE NULLS NOT DISTINCT (instagram_handle);
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Trigram search on name
CREATE INDEX IF NOT EXISTS idx_directory_celebrities_name_trgm
    ON directory_celebrities USING gin (name gin_trgm_ops);

-- GIN on aliases array
CREATE INDEX IF NOT EXISTS idx_directory_celebrities_aliases
    ON directory_celebrities USING gin (aliases);

-- GIN on known_eyewear_brands array
CREATE INDEX IF NOT EXISTS idx_directory_celebrities_known_brands
    ON directory_celebrities USING gin (known_eyewear_brands);

-- B-tree filter columns
CREATE INDEX IF NOT EXISTS idx_directory_celebrities_region
    ON directory_celebrities (region);

CREATE INDEX IF NOT EXISTS idx_directory_celebrities_country
    ON directory_celebrities (country);

CREATE INDEX IF NOT EXISTS idx_directory_celebrities_iso_alpha2
    ON directory_celebrities (iso_alpha2);

CREATE INDEX IF NOT EXISTS idx_directory_celebrities_category
    ON directory_celebrities (category);

CREATE INDEX IF NOT EXISTS idx_directory_celebrities_eyewear_affinity
    ON directory_celebrities (eyewear_affinity);

-- Cron job picking: scan_enabled + last_scanned_at (feeds the celeb-scan cron)
CREATE INDEX IF NOT EXISTS idx_directory_celebrities_cron_pick
    ON directory_celebrities (last_scanned_at NULLS FIRST)
    WHERE scan_enabled = true;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_directory_celebrities_updated_at ON directory_celebrities;
CREATE TRIGGER trg_directory_celebrities_updated_at
    BEFORE UPDATE ON directory_celebrities
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-populate slug from name on INSERT if not provided
CREATE OR REPLACE FUNCTION auto_slug_celebrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.slug IS NULL OR NEW.slug = '' THEN
        NEW.slug := slugify(NEW.name);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_directory_celebrities_slug ON directory_celebrities;
CREATE TRIGGER trg_directory_celebrities_slug
    BEFORE INSERT ON directory_celebrities
    FOR EACH ROW EXECUTE FUNCTION auto_slug_celebrity();

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE directory_celebrities IS
    'Celebrity and influencer master directory. '
    'Drives the Vision moat pipeline: celeb IG posts are scanned, eyewear is '
    'detected and embedded, then matched against product_embeddings. '
    'scan_enabled + last_scanned_at drives the celeb-scan cron queue.';

COMMENT ON COLUMN directory_celebrities.scan_frequency_hours IS
    'How often the celeb-scan cron should re-process this celebrity. '
    'Default 168 = weekly. Set lower (e.g. 24) for high-value celebrities.';

COMMENT ON COLUMN directory_celebrities.eyewear_affinity IS
    'Editorial judgement on how frequently this celebrity wears eyewear. '
    'high = often photographed in glasses/sunglasses. '
    'Values: high | medium | low | unknown.';
