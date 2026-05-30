-- =============================================================================
-- 0005_brand_content.sql
-- Lenzy v2 · Polymorphic content table
--
-- Every piece of brand/celebrity content lives here — IG posts, products,
-- celebrity photos, news, reimagines, ads, TikToks, etc.  New content types
-- are new rows, never new tables or columns.
-- Idempotent: uses CREATE TABLE IF NOT EXISTS.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS brand_content CASCADE;
-- =============================================================================

CREATE TABLE IF NOT EXISTS brand_content (

    -- Primary key
    id                  bigserial       PRIMARY KEY,

    -- Brand linkage (NULLABLE — celebrity-originated posts may not have one yet)
    brand_id            bigint
                            REFERENCES tracked_brands(id)
                            ON DELETE CASCADE
                            DEFERRABLE INITIALLY DEFERRED,

    -- Content type  ─ discriminator column
    type                text            NOT NULL
                                        CHECK (type IN (
                                            'ig_post',
                                            'ig_reel',
                                            'ig_story',
                                            'product',
                                            'celeb_photo',
                                            'people_move',
                                            'news',
                                            'reimagine',
                                            'tiktok',
                                            'youtube',
                                            'linkedin_post',
                                            'ad',
                                            'pinterest_pin',
                                            'reddit_post',
                                            'store_opening',
                                            'unattributed_photo',
                                            'website_link',
                                            'person',
                                            'other'
                                        )),

    -- Cross-entity FKs
    celebrity_id        bigint
                            REFERENCES directory_celebrities(id)
                            ON DELETE SET NULL,
    person_id           bigint
                            REFERENCES directory_people(id)
                            ON DELETE SET NULL,

    -- Self-referential: reimagines → source post
    parent_id           bigint
                            REFERENCES brand_content(id)
                            ON DELETE SET NULL,

    -- Source / identity
    brand_handle        text,           -- denormalized for query convenience
    source_platform     text,           -- apify / brave / manual / reimagine / cron
    source_ref          text,           -- original ID in the source system
    external_url        text,           -- canonical external link
    is_active           boolean         NOT NULL DEFAULT true,

    -- Universal content fields
    title               text,
    caption             text,
    description         text,
    hashtags            text[]          NOT NULL DEFAULT '{}',
    mentions            text[]          NOT NULL DEFAULT '{}',
    tags                text[]          NOT NULL DEFAULT '{}',

    -- Media
    image_url           text,           -- original (may expire)
    image_blob_url      text,           -- Vercel Blob persisted (permanent)
    video_url           text,
    thumbnail_url       text,
    media_type          text,           -- image / video / carousel / etc.
    media_urls          text[]          NOT NULL DEFAULT '{}',   -- multi-image carousels

    -- Temporal
    occurred_at         timestamptz,    -- when source content was published
    ingested_at         timestamptz     NOT NULL DEFAULT now(),

    -- Engagement metrics (jsonb for forward compatibility)
    -- Shape: {likes, comments, shares, views, saves}
    engagement          jsonb           DEFAULT '{}'::jsonb,

    -- Vision analysis output
    -- Shape: {eyewear_present, shape, color, material, regions:[{bbox,crop_url}]}
    vision              jsonb           DEFAULT '{}'::jsonb,

    -- Attribution output (written by the match pipeline)
    -- Shape: {brand_id, product_id, confidence, method, top_k:[{id,score}]}
    attribution         jsonb           DEFAULT '{}'::jsonb,

    -- Type-specific catch-all (price, product_type, person fields, etc.)
    data                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now()

);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Primary query pattern: brand feed (brand_id, type, recent-first)
CREATE INDEX IF NOT EXISTS idx_brand_content_brand_type_occurred
    ON brand_content (brand_id, type, occurred_at DESC NULLS LAST);

-- Celebrity content feed
CREATE INDEX IF NOT EXISTS idx_brand_content_celebrity_occurred
    ON brand_content (celebrity_id, occurred_at DESC NULLS LAST);

-- Person content feed
CREATE INDEX IF NOT EXISTS idx_brand_content_person_occurred
    ON brand_content (person_id, occurred_at DESC NULLS LAST);

-- Type-only filter (global feed by type)
CREATE INDEX IF NOT EXISTS idx_brand_content_type
    ON brand_content (type);

-- Parent / reimagine chain
CREATE INDEX IF NOT EXISTS idx_brand_content_parent_id
    ON brand_content (parent_id)
    WHERE parent_id IS NOT NULL;

-- Source deduplication lookup
CREATE INDEX IF NOT EXISTS idx_brand_content_source_ref
    ON brand_content (source_platform, source_ref)
    WHERE source_ref IS NOT NULL;

-- Recency (global recent-posts feed)
CREATE INDEX IF NOT EXISTS idx_brand_content_occurred_at
    ON brand_content (occurred_at DESC NULLS LAST);

-- GIN on data jsonb (for vision/attribution JSONB queries)
CREATE INDEX IF NOT EXISTS idx_brand_content_data_gin
    ON brand_content USING gin (data);

CREATE INDEX IF NOT EXISTS idx_brand_content_vision_gin
    ON brand_content USING gin (vision);

CREATE INDEX IF NOT EXISTS idx_brand_content_attribution_gin
    ON brand_content USING gin (attribution);

-- GIN on hashtags array
CREATE INDEX IF NOT EXISTS idx_brand_content_hashtags
    ON brand_content USING gin (hashtags);

-- GIN on tags array
CREATE INDEX IF NOT EXISTS idx_brand_content_tags
    ON brand_content USING gin (tags);

-- Trigram on caption (search inside captions)
CREATE INDEX IF NOT EXISTS idx_brand_content_caption_trgm
    ON brand_content USING gin (caption gin_trgm_ops)
    WHERE caption IS NOT NULL;

-- Active content (most queries filter on is_active)
CREATE INDEX IF NOT EXISTS idx_brand_content_active
    ON brand_content (brand_id, occurred_at DESC)
    WHERE is_active = true;

-- Review queue: unattributed_photo with mid-confidence attribution
-- Partial index for the Editor review queue (see 0040_review_queue.sql)
CREATE INDEX IF NOT EXISTS idx_brand_content_review_queue
    ON brand_content (id)
    WHERE type = 'unattributed_photo'
      AND is_active = true
      AND (attribution ->> 'confidence')::numeric BETWEEN 0.5 AND 0.75;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_brand_content_updated_at ON brand_content;
CREATE TRIGGER trg_brand_content_updated_at
    BEFORE UPDATE ON brand_content
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE brand_content IS
    'Polymorphic content table — every piece of content tied to a brand '
    'or celebrity lives here. type column is the discriminator. '
    'New content types are new rows, not new tables.';

COMMENT ON COLUMN brand_content.brand_id IS
    'Nullable: celebrity-originated unattributed photos do not yet have a brand. '
    'The vision pipeline populates this after attribution.';

COMMENT ON COLUMN brand_content.vision IS
    'Output of the Gemini Vision detect pass. '
    'Shape: {eyewear_present:bool, shape:text, color:text, material:text, '
    'regions:[{bbox:{x,y,w,h}, crop_url:text}]}.';

COMMENT ON COLUMN brand_content.attribution IS
    'Output of the HNSW similarity match pipeline. '
    'Shape: {brand_id:int, product_id:int, confidence:float, method:text, '
    'top_k:[{id:int, score:float}]}. '
    'confidence > 0.75 → auto-attribute; 0.5–0.75 → Editor review queue; <0.5 → unattributed.';

COMMENT ON COLUMN brand_content.engagement IS
    'Platform engagement metrics snapshot at ingestion time. '
    'Shape: {likes:int, comments:int, shares:int, views:int, saves:int}.';
