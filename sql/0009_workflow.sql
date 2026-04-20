-- =============================================================================
-- 0009_workflow.sql
-- Lenzy v2 · Team workflow tables
--
-- watchlist      — per-user pinned brands
-- boards         — per-user or shared content boards
-- board_items    — items pinned to a board (any brand_content row)
-- comments       — threaded comments on any entity
-- saved_searches — bookmarked filter combinations
-- alerts         — outbox for in-app + email notifications
--
-- All tables carry a nullable workspace_id column from day one for
-- future multi-tenant support (per spec §5).
-- Idempotent: uses CREATE TABLE IF NOT EXISTS.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS alerts CASCADE;
--   DROP TABLE IF EXISTS saved_searches CASCADE;
--   DROP TABLE IF EXISTS comments CASCADE;
--   DROP TABLE IF EXISTS board_items CASCADE;
--   DROP TABLE IF EXISTS boards CASCADE;
--   DROP TABLE IF EXISTS watchlist CASCADE;
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. watchlist — per-user pinned brands
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS watchlist (

    id                  bigserial       PRIMARY KEY,

    user_id             uuid            NOT NULL
                            REFERENCES users(id)
                            ON DELETE CASCADE,

    brand_id            bigint          NOT NULL
                            REFERENCES tracked_brands(id)
                            ON DELETE CASCADE,

    workspace_id        uuid,           -- future multi-tenant (nullable)

    added_at            timestamptz     NOT NULL DEFAULT now(),
    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now()

);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_watchlist_user_brand'
          AND conrelid = 'watchlist'::regclass
    ) THEN
        ALTER TABLE watchlist
            ADD CONSTRAINT uq_watchlist_user_brand
            UNIQUE (user_id, brand_id);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_watchlist_user_id
    ON watchlist (user_id);

CREATE INDEX IF NOT EXISTS idx_watchlist_brand_id
    ON watchlist (brand_id);

DROP TRIGGER IF EXISTS trg_watchlist_updated_at ON watchlist;
CREATE TRIGGER trg_watchlist_updated_at
    BEFORE UPDATE ON watchlist
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. boards — per-user or shared swipe files
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS boards (

    id                  bigserial       PRIMARY KEY,
    uuid                uuid            NOT NULL DEFAULT gen_random_uuid(),

    owner_id            uuid            NOT NULL
                            REFERENCES users(id)
                            ON DELETE CASCADE,

    name                text            NOT NULL,
    description         text,
    is_shared           boolean         NOT NULL DEFAULT false,
    cover_image_url     text,

    workspace_id        uuid,           -- future multi-tenant (nullable)

    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now()

);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_boards_uuid'
          AND conrelid = 'boards'::regclass
    ) THEN
        ALTER TABLE boards
            ADD CONSTRAINT uq_boards_uuid UNIQUE (uuid);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_boards_owner_id
    ON boards (owner_id);

CREATE INDEX IF NOT EXISTS idx_boards_is_shared
    ON boards (is_shared)
    WHERE is_shared = true;

DROP TRIGGER IF EXISTS trg_boards_updated_at ON boards;
CREATE TRIGGER trg_boards_updated_at
    BEFORE UPDATE ON boards
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. board_items — content pinned to a board
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS board_items (

    id                  bigserial       PRIMARY KEY,

    board_id            bigint          NOT NULL
                            REFERENCES boards(id)
                            ON DELETE CASCADE,

    content_id          bigint          NOT NULL
                            REFERENCES brand_content(id)
                            ON DELETE CASCADE,

    note                text,
    sort_order          int             NOT NULL DEFAULT 0,

    added_by            uuid
                            REFERENCES users(id)
                            ON DELETE SET NULL,

    workspace_id        uuid,           -- future multi-tenant (nullable)

    added_at            timestamptz     NOT NULL DEFAULT now(),
    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now()

);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_board_items_board_content'
          AND conrelid = 'board_items'::regclass
    ) THEN
        ALTER TABLE board_items
            ADD CONSTRAINT uq_board_items_board_content
            UNIQUE (board_id, content_id);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_board_items_board_id
    ON board_items (board_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_board_items_content_id
    ON board_items (content_id);

DROP TRIGGER IF EXISTS trg_board_items_updated_at ON board_items;
CREATE TRIGGER trg_board_items_updated_at
    BEFORE UPDATE ON board_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. comments — threaded comments on any entity
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS comments (

    id                  bigserial       PRIMARY KEY,
    uuid                uuid            NOT NULL DEFAULT gen_random_uuid(),

    user_id             uuid            NOT NULL
                            REFERENCES users(id)
                            ON DELETE CASCADE,

    -- Polymorphic entity target
    entity_type         text            NOT NULL
                                        CHECK (entity_type IN (
                                            'brand', 'content', 'person',
                                            'celebrity', 'product', 'board'
                                        )),
    entity_id           bigint          NOT NULL,

    -- Threading
    parent_id           bigint
                            REFERENCES comments(id)
                            ON DELETE SET NULL,

    body                text            NOT NULL,
    mentions            text[]          NOT NULL DEFAULT '{}',   -- @user slugs

    workspace_id        uuid,           -- future multi-tenant (nullable)

    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now()

);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_comments_uuid'
          AND conrelid = 'comments'::regclass
    ) THEN
        ALTER TABLE comments
            ADD CONSTRAINT uq_comments_uuid UNIQUE (uuid);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_comments_entity
    ON comments (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_user_id
    ON comments (user_id);

CREATE INDEX IF NOT EXISTS idx_comments_parent_id
    ON comments (parent_id)
    WHERE parent_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_comments_updated_at ON comments;
CREATE TRIGGER trg_comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. saved_searches — bookmarked filter combinations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS saved_searches (

    id                  bigserial       PRIMARY KEY,
    uuid                uuid            NOT NULL DEFAULT gen_random_uuid(),

    user_id             uuid            NOT NULL
                            REFERENCES users(id)
                            ON DELETE CASCADE,

    name                text            NOT NULL,
    filter_json         jsonb           NOT NULL DEFAULT '{}'::jsonb,
    notify              boolean         NOT NULL DEFAULT false,

    workspace_id        uuid,           -- future multi-tenant (nullable)

    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now()

);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_saved_searches_uuid'
          AND conrelid = 'saved_searches'::regclass
    ) THEN
        ALTER TABLE saved_searches
            ADD CONSTRAINT uq_saved_searches_uuid UNIQUE (uuid);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id
    ON saved_searches (user_id);

CREATE INDEX IF NOT EXISTS idx_saved_searches_notify
    ON saved_searches (user_id)
    WHERE notify = true;

DROP TRIGGER IF EXISTS trg_saved_searches_updated_at ON saved_searches;
CREATE TRIGGER trg_saved_searches_updated_at
    BEFORE UPDATE ON saved_searches
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. alerts — outbox for in-app + email notifications
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS alerts (

    id                  bigserial       PRIMARY KEY,
    uuid                uuid            NOT NULL DEFAULT gen_random_uuid(),

    user_id             uuid            NOT NULL
                            REFERENCES users(id)
                            ON DELETE CASCADE,

    kind                text            NOT NULL
                                        CHECK (kind IN (
                                            'price_change',
                                            'person_move',
                                            'new_post',
                                            'new_product',
                                            'celeb_match',
                                            'review_queue',
                                            'digest',
                                            'other'
                                        )),

    -- What triggered the alert
    target_type         text,           -- 'brand' / 'person' / 'content' etc.
    target_id           bigint,

    payload             jsonb           DEFAULT '{}'::jsonb,

    -- Delivery tracking
    delivered_at        timestamptz,
    seen_at             timestamptz,

    workspace_id        uuid,           -- future multi-tenant (nullable)

    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now()

);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_alerts_uuid'
          AND conrelid = 'alerts'::regclass
    ) THEN
        ALTER TABLE alerts
            ADD CONSTRAINT uq_alerts_uuid UNIQUE (uuid);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_alerts_user_id
    ON alerts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_undelivered
    ON alerts (user_id)
    WHERE delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_alerts_unseen
    ON alerts (user_id)
    WHERE seen_at IS NULL;

DROP TRIGGER IF EXISTS trg_alerts_updated_at ON alerts;
CREATE TRIGGER trg_alerts_updated_at
    BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE watchlist IS
    'Per-user list of pinned brands. Used in the Feed brand-set filter.';

COMMENT ON TABLE boards IS
    'User-created content boards (swipe files). Can be private or shared.';

COMMENT ON TABLE board_items IS
    'Items pinned to a board. Linked to brand_content rows.';

COMMENT ON TABLE comments IS
    'Threaded comments on any entity (brand, content, person, celebrity, product, board). '
    'entity_type + entity_id is the polymorphic target.';

COMMENT ON TABLE saved_searches IS
    'Bookmarked filter state. notify=true triggers an alert when new results match.';

COMMENT ON TABLE alerts IS
    'Notification outbox. Rows are read by the digest email job and in-app notification system.';
