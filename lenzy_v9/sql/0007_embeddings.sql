-- =============================================================================
-- 0007_embeddings.sql
-- Lenzy v2 · pgvector embedding tables
--
-- product_embeddings  — text (1536-dim) + image (512-dim) per product
-- celeb_photo_embeddings — image crops from brand_content rows
--
-- Both tables use HNSW indexes (m=16, ef_construction=64) which handle up to
-- ~5M rows comfortably on Supabase Pro without partitioning.
-- Requires: 0001 (pgvector extension), 0006 (products), 0005 (brand_content).
-- Idempotent: uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS celeb_photo_embeddings CASCADE;
--   DROP TABLE IF EXISTS product_embeddings CASCADE;
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. product_embeddings
--    One row per product × embedding-type (text and/or image).
--    Storing both vectors in the same row allows a single join to retrieve
--    both; rows where a vector hasn't been computed yet will be NULL.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS product_embeddings (

    id                  bigserial       PRIMARY KEY,

    -- Product FK
    product_id          bigint          NOT NULL
                            REFERENCES products(id)
                            ON DELETE CASCADE
                            DEFERRABLE INITIALLY DEFERRED,

    -- Text embedding (OpenAI text-embedding-3-small, 1536 dims)
    text_embedding      vector(1536),
    model_text          text,           -- e.g. 'text-embedding-3-small'

    -- Image embedding (OpenCLIP / Cohere multimodal, 512 dims)
    image_embedding     vector(512),
    model_image         text,           -- e.g. 'openclip-vit-b-32'

    -- Metadata
    input_text          text,           -- the text that was embedded (name + description + tags)
    image_url           text,           -- the image URL that was embedded

    -- Timestamps
    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now()

);

-- One embedding row per product (both vectors in same row)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_product_embeddings_product_id'
          AND conrelid = 'product_embeddings'::regclass
    ) THEN
        ALTER TABLE product_embeddings
            ADD CONSTRAINT uq_product_embeddings_product_id
            UNIQUE (product_id);
    END IF;
END;
$$;

-- B-tree: lookup embeddings for a product
CREATE INDEX IF NOT EXISTS idx_product_embeddings_product_id
    ON product_embeddings (product_id);

-- Partial: only rows with a text embedding (skip NULLs)
CREATE INDEX IF NOT EXISTS idx_product_embeddings_text_notnull
    ON product_embeddings (product_id)
    WHERE text_embedding IS NOT NULL;

-- Partial: only rows with an image embedding
CREATE INDEX IF NOT EXISTS idx_product_embeddings_image_notnull
    ON product_embeddings (product_id)
    WHERE image_embedding IS NOT NULL;

-- HNSW index on text_embedding (cosine distance — best for normalized vectors)
-- m=16: 16 bidirectional links per node. ef_construction=64: build-time search
-- window. Good default for up to ~5M rows. At query time SET
-- hnsw.ef_search = 100 for higher recall.
CREATE INDEX IF NOT EXISTS idx_product_embeddings_text_hnsw
    ON product_embeddings
    USING hnsw (text_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- HNSW index on image_embedding
CREATE INDEX IF NOT EXISTS idx_product_embeddings_image_hnsw
    ON product_embeddings
    USING hnsw (image_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_product_embeddings_updated_at ON product_embeddings;
CREATE TRIGGER trg_product_embeddings_updated_at
    BEFORE UPDATE ON product_embeddings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. celeb_photo_embeddings
--    One row per eyewear-region crop extracted from a brand_content row.
--    Multiple crops per content row are differentiated by crop_index.
--    Used in the cosine-similarity match against product_embeddings.image_embedding.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS celeb_photo_embeddings (

    id                  bigserial       PRIMARY KEY,

    -- Source brand_content row (unattributed_photo or celeb_photo)
    content_id          bigint          NOT NULL
                            REFERENCES brand_content(id)
                            ON DELETE CASCADE
                            DEFERRABLE INITIALLY DEFERRED,

    -- Which crop within that content row (0-indexed)
    crop_index          smallint        NOT NULL DEFAULT 0,

    -- The cropped image (uploaded to Vercel Blob by the vision pipeline)
    crop_url            text,

    -- Image embedding (512-dim, matches product_embeddings.image_embedding)
    embedding           vector(512)     NOT NULL,
    model               text,           -- e.g. 'openclip-vit-b-32'

    -- Timestamps
    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now()

);

-- Unique: one embedding per (content_id, crop_index)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_celeb_photo_embeddings_content_crop'
          AND conrelid = 'celeb_photo_embeddings'::regclass
    ) THEN
        ALTER TABLE celeb_photo_embeddings
            ADD CONSTRAINT uq_celeb_photo_embeddings_content_crop
            UNIQUE (content_id, crop_index);
    END IF;
END;
$$;

-- B-tree: look up all crops for a content row
CREATE INDEX IF NOT EXISTS idx_celeb_photo_embeddings_content_id
    ON celeb_photo_embeddings (content_id);

-- HNSW index for cosine-similarity search (matches against product image embeddings)
CREATE INDEX IF NOT EXISTS idx_celeb_photo_embeddings_hnsw
    ON celeb_photo_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_celeb_photo_embeddings_updated_at ON celeb_photo_embeddings;
CREATE TRIGGER trg_celeb_photo_embeddings_updated_at
    BEFORE UPDATE ON celeb_photo_embeddings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE product_embeddings IS
    'pgvector embeddings for products. '
    'text_embedding = OpenAI text-embedding-3-small on (name + description + tags). '
    'image_embedding = OpenCLIP on primary product image. '
    'Both use HNSW cosine indexes (m=16, ef_construction=64).';

COMMENT ON TABLE celeb_photo_embeddings IS
    'Image embeddings of eyewear-region crops extracted from brand_content rows '
    'by the Gemini Vision + crop pipeline. '
    'Used for nearest-neighbour match against product_embeddings.image_embedding.';

COMMENT ON COLUMN celeb_photo_embeddings.crop_index IS
    'Zero-based index of this crop within its parent content row. '
    'A single photo may contain multiple eyewear regions (e.g. two people).';
