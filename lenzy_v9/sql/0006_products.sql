-- =============================================================================
-- 0006_products.sql
-- Lenzy v2 · Products table (sitemap/ingestion-derived)
--
-- Dedicated products table for structured product data. Each product row
-- points back to tracked_brands. Embeddings live in product_embeddings
-- (see 0007_embeddings.sql).
-- Idempotent: uses CREATE TABLE IF NOT EXISTS.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS products CASCADE;
-- =============================================================================

CREATE TABLE IF NOT EXISTS products (

    -- Primary key
    id                  bigserial       PRIMARY KEY,
    uuid                uuid            NOT NULL DEFAULT gen_random_uuid(),

    -- Brand linkage
    brand_id            bigint          NOT NULL
                            REFERENCES tracked_brands(id)
                            ON DELETE CASCADE
                            DEFERRABLE INITIALLY DEFERRED,

    -- Identity
    url                 text            NOT NULL,   -- canonical product page URL
    name                text,
    description         text,
    sku                 text,

    -- Pricing
    price_cents         int,            -- current price in minor currency unit
    compare_price_cents int,            -- original / compare-at price
    currency            char(3)         NOT NULL DEFAULT 'USD',

    -- Availability
    in_stock            boolean,
    inventory_quantity  int,

    -- Classification
    category            text,
    product_type        text,           -- frame type, e.g. "Sunglasses", "Optical"
    subcategory         text,

    -- Rich attributes (colors, materials, sizes, prescription details, etc.)
    attributes          jsonb           DEFAULT '{}'::jsonb,

    -- Media
    images              text[]          NOT NULL DEFAULT '{}',

    -- Lifecycle
    launched_at         timestamptz,
    first_seen_at       timestamptz     NOT NULL DEFAULT now(),
    last_seen_at        timestamptz     NOT NULL DEFAULT now(),

    -- Provenance
    source              text,           -- sitemap / apify / xlsx_import / manual
    source_ref          text,           -- original product ID from source

    -- Timestamps
    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now()

);

-- ---------------------------------------------------------------------------
-- Unique constraints
-- ---------------------------------------------------------------------------

-- A product URL should appear once (deduplication key for sitemap ingestion)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_products_url'
          AND conrelid = 'products'::regclass
    ) THEN
        ALTER TABLE products
            ADD CONSTRAINT uq_products_url UNIQUE (url);
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_products_uuid'
          AND conrelid = 'products'::regclass
    ) THEN
        ALTER TABLE products
            ADD CONSTRAINT uq_products_uuid UNIQUE (uuid);
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Primary query pattern: brand product catalog
CREATE INDEX IF NOT EXISTS idx_products_brand_id
    ON products (brand_id);

CREATE INDEX IF NOT EXISTS idx_products_brand_category
    ON products (brand_id, category);

-- Price queries
CREATE INDEX IF NOT EXISTS idx_products_price_cents
    ON products (price_cents);

-- Filter: in-stock
CREATE INDEX IF NOT EXISTS idx_products_in_stock
    ON products (brand_id)
    WHERE in_stock = true;

-- Classification
CREATE INDEX IF NOT EXISTS idx_products_category
    ON products (category);

CREATE INDEX IF NOT EXISTS idx_products_product_type
    ON products (product_type);

-- Lifecycle / recency
CREATE INDEX IF NOT EXISTS idx_products_launched_at
    ON products (launched_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_products_first_seen_at
    ON products (first_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_last_seen_at
    ON products (last_seen_at DESC);

-- Trigram search on name
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
    ON products USING gin (name gin_trgm_ops)
    WHERE name IS NOT NULL;

-- GIN on attributes jsonb
CREATE INDEX IF NOT EXISTS idx_products_attributes_gin
    ON products USING gin (attributes);

-- Source deduplication
CREATE INDEX IF NOT EXISTS idx_products_source_ref
    ON products (source, source_ref)
    WHERE source_ref IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-refresh last_seen_at on any update
CREATE OR REPLACE FUNCTION refresh_product_last_seen()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.last_seen_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_last_seen ON products;
CREATE TRIGGER trg_products_last_seen
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION refresh_product_last_seen();

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE products IS
    'Structured product catalog ingested from brand sitemaps and Apify actors. '
    'One row per unique product URL. '
    'Vector embeddings live in product_embeddings (0007_embeddings.sql).';

COMMENT ON COLUMN products.price_cents IS
    'Price in the smallest unit of currency (e.g. cents for USD). '
    'Divide by 100 for display. Avoids floating-point issues.';

COMMENT ON COLUMN products.attributes IS
    'Flexible product attributes. Typical keys: color, material, frame_shape, '
    'lens_type, prescription, gender, age_group, uv_protection.';
