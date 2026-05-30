-- =============================================================================
-- 0002_tracked_brands.sql
-- Lenzy v2 · Master brand directory
--
-- Preserves all columns from docs/04_DATA_SCHEMA.md (tracked_brands) and adds
-- v9 fields: iso_alpha2, iso_alpha3, aliases, uuid, needs_reverification,
-- revenue_usd_estimate, employee_estimate, store_estimate, provenance.
-- Idempotent: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS tracked_brands CASCADE;
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tracked_brands (

    -- Primary / natural keys
    id                      bigserial       PRIMARY KEY,
    uuid                    uuid            NOT NULL DEFAULT gen_random_uuid(),
    handle                  text            NOT NULL,   -- IG handle / URL slug

    -- Display
    name                    text            NOT NULL,
    description             text,
    notes                   text,
    tags                    text[]          NOT NULL DEFAULT '{}',
    aliases                 text[]          NOT NULL DEFAULT '{}',

    -- Geography
    country                 text,
    iso_alpha2              char(2),        -- ISO 3166-1 alpha-2  (e.g. 'US')
    iso_alpha3              char(3),        -- ISO 3166-1 alpha-3  (e.g. 'USA')
    iso_code                text,           -- legacy field kept for backward compat
    region                  text,           -- North America / Europe / APAC / etc.
    hq_city                 text,
    source_country          text,           -- manufacturing origin vs HQ

    -- Business classification
    category                text,           -- Luxury / D2C / Sports / Heritage / …
    subcategory             text,           -- Sunglasses / Optical / Both / Smart
    business_type           text,           -- Brand / Fashion House / Retailer / …
    business_model          text,           -- D2C / Wholesale / Licensed / Franchise
    distribution_channel    text,
    product_focus           text,
    price_range             text,           -- Budget / Mid / Premium / Luxury / Prestige
    price_tier              text,           -- aliased name used in v9 CSV
    founded_year            int,

    -- Flags (boolean)
    is_d2c                  boolean         NOT NULL DEFAULT false,
    is_manufacturer         boolean         NOT NULL DEFAULT false,
    is_retailer             boolean         NOT NULL DEFAULT false,
    is_luxury               boolean         NOT NULL DEFAULT false,
    is_independent          boolean         NOT NULL DEFAULT false,
    is_smart_eyewear        boolean         NOT NULL DEFAULT false,
    has_manufacturing       boolean         NOT NULL DEFAULT false,
    has_sitemap             boolean         NOT NULL DEFAULT false,
    sustainability_focus    boolean         NOT NULL DEFAULT false,

    -- Ownership / financial (estimates; see provenance for sourcing)
    parent_company          text,
    ownership_type          text,           -- Private / Public / PE-owned / VC-backed / Family
    is_public               boolean         NOT NULL DEFAULT false,
    stock_ticker            text,
    employee_count          int,            -- legacy; prefer employee_estimate
    employee_estimate       int,            -- v9 field
    store_count             int,            -- legacy; prefer store_estimate
    store_estimate          int,            -- v9 field
    revenue_estimate        numeric,        -- legacy (USD annual)
    revenue_usd_estimate    bigint,         -- v9 field (explicit integer cents)
    monthly_traffic         text,           -- "500K" format

    -- Leadership
    ceo_name                text,

    -- Classification codes
    naics_code              text,
    sic_code                text,

    -- Social URLs
    website                 text,
    instagram_url           text,
    facebook_url            text,
    twitter_url             text,
    tiktok_url              text,
    youtube_url             text,
    linkedin_url            text,
    logo_url                text,

    -- Metrics
    instagram_followers     bigint,
    product_urls_found      int             DEFAULT 0,
    total_sitemap_urls      int             DEFAULT 0,
    key_people_count        int             DEFAULT 0,
    confidence_pct          int             CHECK (confidence_pct BETWEEN 0 AND 100),
    completeness_pct        int             CHECK (completeness_pct BETWEEN 0 AND 100),

    -- Operational
    tier                    text            NOT NULL DEFAULT 'mid'
                                            CHECK (tier IN ('fast', 'mid', 'full')),
    active                  boolean         NOT NULL DEFAULT true,
    source                  text,           -- seed / upload / manual / xlsx_import
    posts_scraped           int             DEFAULT 0,
    last_scraped_at         timestamptz,
    added_at                timestamptz     DEFAULT now(),
    added_by                text,

    -- Data quality / provenance (v9)
    needs_reverification    boolean         NOT NULL DEFAULT false,
    data_quality            jsonb           DEFAULT '{}'::jsonb,
    provenance              jsonb           DEFAULT '{}'::jsonb,
                                            -- per-field source tags, e.g.
                                            -- {"name":"source_v8","revenue_usd":"unverified_llm_estimate"}

    -- Flex catch-all
    details                 jsonb           DEFAULT '{}'::jsonb,
    people                  jsonb,          -- DEPRECATED: use directory_people

    -- Timestamps
    created_at              timestamptz     NOT NULL DEFAULT now(),
    updated_at              timestamptz     NOT NULL DEFAULT now()

);

-- ---------------------------------------------------------------------------
-- Unique constraints
-- ---------------------------------------------------------------------------

-- Natural key: Instagram handle
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_tracked_brands_handle'
          AND conrelid = 'tracked_brands'::regclass
    ) THEN
        ALTER TABLE tracked_brands
            ADD CONSTRAINT uq_tracked_brands_handle UNIQUE (handle);
    END IF;
END;
$$;

-- Case-insensitive (name, iso_alpha2) composite uniqueness
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_tracked_brands_name_iso'
          AND conrelid = 'tracked_brands'::regclass
    ) THEN
        ALTER TABLE tracked_brands
            ADD CONSTRAINT uq_tracked_brands_name_iso
            UNIQUE NULLS NOT DISTINCT (
                (lower(name)),
                (COALESCE(iso_alpha2, ''))
            );
    END IF;
END;
$$;

-- uuid uniqueness
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_tracked_brands_uuid'
          AND conrelid = 'tracked_brands'::regclass
    ) THEN
        ALTER TABLE tracked_brands
            ADD CONSTRAINT uq_tracked_brands_uuid UNIQUE (uuid);
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- GIN on tags array
CREATE INDEX IF NOT EXISTS idx_tracked_brands_tags
    ON tracked_brands USING gin (tags);

-- Trigram on name (pg_trgm required)
CREATE INDEX IF NOT EXISTS idx_tracked_brands_name_trgm
    ON tracked_brands USING gin (name gin_trgm_ops);

-- Trigram on aliases array elements (cast to text for trgm)
CREATE INDEX IF NOT EXISTS idx_tracked_brands_aliases_gin
    ON tracked_brands USING gin (aliases);

-- B-tree lookup columns
CREATE INDEX IF NOT EXISTS idx_tracked_brands_iso_alpha2
    ON tracked_brands (iso_alpha2);

CREATE INDEX IF NOT EXISTS idx_tracked_brands_iso_alpha3
    ON tracked_brands (iso_alpha3);

CREATE INDEX IF NOT EXISTS idx_tracked_brands_region
    ON tracked_brands (region);

CREATE INDEX IF NOT EXISTS idx_tracked_brands_category
    ON tracked_brands (category);

CREATE INDEX IF NOT EXISTS idx_tracked_brands_founded_year
    ON tracked_brands (founded_year);

CREATE INDEX IF NOT EXISTS idx_tracked_brands_tier
    ON tracked_brands (tier);

CREATE INDEX IF NOT EXISTS idx_tracked_brands_ownership_type
    ON tracked_brands (ownership_type);

CREATE INDEX IF NOT EXISTS idx_tracked_brands_parent_company
    ON tracked_brands (parent_company);

-- Partial: active brands only (the hot read path)
CREATE INDEX IF NOT EXISTS idx_tracked_brands_active
    ON tracked_brands (id)
    WHERE active = true;

-- Partial flag indexes (for filter queries)
CREATE INDEX IF NOT EXISTS idx_tracked_brands_is_d2c
    ON tracked_brands (id) WHERE is_d2c = true;

CREATE INDEX IF NOT EXISTS idx_tracked_brands_is_luxury
    ON tracked_brands (id) WHERE is_luxury = true;

CREATE INDEX IF NOT EXISTS idx_tracked_brands_has_sitemap
    ON tracked_brands (id) WHERE has_sitemap = true;

CREATE INDEX IF NOT EXISTS idx_tracked_brands_needs_reverification
    ON tracked_brands (id) WHERE needs_reverification = true;

-- Stale-data cron support
CREATE INDEX IF NOT EXISTS idx_tracked_brands_last_scraped_at
    ON tracked_brands (last_scraped_at NULLS FIRST);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_tracked_brands_updated_at ON tracked_brands;
CREATE TRIGGER trg_tracked_brands_updated_at
    BEFORE UPDATE ON tracked_brands
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- completeness_pct trigger
--    Re-computes completeness_pct on every INSERT or UPDATE.
--    Scoring weights: key identity / social fields each worth points up to 100.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION compute_brand_completeness()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_score int := 0;
BEGIN
    -- Identity (25 pts)
    IF NEW.name        IS NOT NULL THEN v_score := v_score + 5; END IF;
    IF NEW.description IS NOT NULL THEN v_score := v_score + 5; END IF;
    IF NEW.handle      IS NOT NULL THEN v_score := v_score + 5; END IF;
    IF NEW.logo_url    IS NOT NULL THEN v_score := v_score + 5; END IF;
    IF NEW.website     IS NOT NULL THEN v_score := v_score + 5; END IF;

    -- Geography (10 pts)
    IF NEW.country      IS NOT NULL THEN v_score := v_score + 3; END IF;
    IF NEW.iso_alpha2   IS NOT NULL THEN v_score := v_score + 3; END IF;
    IF NEW.region       IS NOT NULL THEN v_score := v_score + 2; END IF;
    IF NEW.hq_city      IS NOT NULL THEN v_score := v_score + 2; END IF;

    -- Business (20 pts)
    IF NEW.category          IS NOT NULL THEN v_score := v_score + 5; END IF;
    IF NEW.business_type     IS NOT NULL THEN v_score := v_score + 5; END IF;
    IF NEW.ownership_type    IS NOT NULL THEN v_score := v_score + 5; END IF;
    IF NEW.founded_year      IS NOT NULL THEN v_score := v_score + 5; END IF;

    -- Social (20 pts)
    IF NEW.instagram_url  IS NOT NULL THEN v_score := v_score + 5; END IF;
    IF NEW.linkedin_url   IS NOT NULL THEN v_score := v_score + 5; END IF;
    IF NEW.instagram_followers IS NOT NULL AND NEW.instagram_followers > 0
        THEN v_score := v_score + 5; END IF;
    IF NEW.facebook_url   IS NOT NULL THEN v_score := v_score + 5; END IF;

    -- Financial estimates (15 pts)
    IF NEW.employee_estimate IS NOT NULL THEN v_score := v_score + 5; END IF;
    IF NEW.store_estimate    IS NOT NULL THEN v_score := v_score + 5; END IF;
    IF NEW.revenue_usd_estimate IS NOT NULL THEN v_score := v_score + 5; END IF;

    -- Operational (10 pts)
    IF NEW.tier              IS NOT NULL THEN v_score := v_score + 5; END IF;
    IF NEW.naics_code        IS NOT NULL THEN v_score := v_score + 3; END IF;
    IF NEW.sic_code          IS NOT NULL THEN v_score := v_score + 2; END IF;

    NEW.completeness_pct := LEAST(v_score, 100);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tracked_brands_completeness ON tracked_brands;
CREATE TRIGGER trg_tracked_brands_completeness
    BEFORE INSERT OR UPDATE ON tracked_brands
    FOR EACH ROW EXECUTE FUNCTION compute_brand_completeness();

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE tracked_brands IS
    'Master directory of eyewear brands and industry players. '
    'Natural key is handle (IG handle / URL slug). '
    'uuid is used for external-facing API responses.';

COMMENT ON COLUMN tracked_brands.provenance IS
    'JSONB map of column name → data source label. '
    'Example: {"revenue_usd_estimate":"unverified_llm_estimate","name":"source_v8"}';

COMMENT ON COLUMN tracked_brands.completeness_pct IS
    'Auto-computed 0-100 score by compute_brand_completeness() trigger. '
    'Do not set manually.';
