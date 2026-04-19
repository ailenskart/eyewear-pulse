-- =============================================================================
-- 0020_rls_policies.sql
-- Lenzy v2 · Row-Level Security policies
--
-- Strategy:
--   anon key        → read-only on public-safe tables (brands, content, celebs)
--   authenticated   → full read on all tables; write only if role IN (admin, editor)
--   service_role    → bypasses RLS entirely (set by Supabase for server-side calls)
--
-- Helper: is_admin()   — current user has role='admin'
-- Helper: is_editor()  — current user has role IN ('admin','editor')
-- Helper: current_user_id() — UUID of the authenticated user
--
-- ROLLBACK:
--   ALTER TABLE <table> DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS <policy_name> ON <table>;
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions (used inside policies to avoid repetition)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid;
$$;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT role FROM public.users WHERE id = current_user_id();
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT current_user_role() = 'admin';
$$;

CREATE OR REPLACE FUNCTION is_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT current_user_role() IN ('admin', 'editor');
$$;

-- ---------------------------------------------------------------------------
-- tracked_brands
-- ---------------------------------------------------------------------------

ALTER TABLE tracked_brands ENABLE ROW LEVEL SECURITY;

-- anon: read active brands only
DROP POLICY IF EXISTS "tracked_brands_anon_read" ON tracked_brands;
CREATE POLICY "tracked_brands_anon_read"
    ON tracked_brands
    FOR SELECT
    TO anon
    USING (active = true);

-- authenticated: read all brands
DROP POLICY IF EXISTS "tracked_brands_auth_read" ON tracked_brands;
CREATE POLICY "tracked_brands_auth_read"
    ON tracked_brands
    FOR SELECT
    TO authenticated
    USING (true);

-- editor/admin: insert
DROP POLICY IF EXISTS "tracked_brands_editor_insert" ON tracked_brands;
CREATE POLICY "tracked_brands_editor_insert"
    ON tracked_brands
    FOR INSERT
    TO authenticated
    WITH CHECK (is_editor());

-- editor/admin: update
DROP POLICY IF EXISTS "tracked_brands_editor_update" ON tracked_brands;
CREATE POLICY "tracked_brands_editor_update"
    ON tracked_brands
    FOR UPDATE
    TO authenticated
    USING (is_editor())
    WITH CHECK (is_editor());

-- admin only: delete
DROP POLICY IF EXISTS "tracked_brands_admin_delete" ON tracked_brands;
CREATE POLICY "tracked_brands_admin_delete"
    ON tracked_brands
    FOR DELETE
    TO authenticated
    USING (is_admin());

-- ---------------------------------------------------------------------------
-- brand_content
-- ---------------------------------------------------------------------------

ALTER TABLE brand_content ENABLE ROW LEVEL SECURITY;

-- anon: read active content
DROP POLICY IF EXISTS "brand_content_anon_read" ON brand_content;
CREATE POLICY "brand_content_anon_read"
    ON brand_content
    FOR SELECT
    TO anon
    USING (is_active = true);

-- authenticated: read all content
DROP POLICY IF EXISTS "brand_content_auth_read" ON brand_content;
CREATE POLICY "brand_content_auth_read"
    ON brand_content
    FOR SELECT
    TO authenticated
    USING (true);

-- editor/admin: insert
DROP POLICY IF EXISTS "brand_content_editor_insert" ON brand_content;
CREATE POLICY "brand_content_editor_insert"
    ON brand_content
    FOR INSERT
    TO authenticated
    WITH CHECK (is_editor());

-- editor/admin: update
DROP POLICY IF EXISTS "brand_content_editor_update" ON brand_content;
CREATE POLICY "brand_content_editor_update"
    ON brand_content
    FOR UPDATE
    TO authenticated
    USING (is_editor())
    WITH CHECK (is_editor());

-- admin only: delete
DROP POLICY IF EXISTS "brand_content_admin_delete" ON brand_content;
CREATE POLICY "brand_content_admin_delete"
    ON brand_content
    FOR DELETE
    TO authenticated
    USING (is_admin());

-- ---------------------------------------------------------------------------
-- directory_celebrities
-- ---------------------------------------------------------------------------

ALTER TABLE directory_celebrities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "directory_celebrities_anon_read" ON directory_celebrities;
CREATE POLICY "directory_celebrities_anon_read"
    ON directory_celebrities
    FOR SELECT
    TO anon
    USING (true);

DROP POLICY IF EXISTS "directory_celebrities_auth_read" ON directory_celebrities;
CREATE POLICY "directory_celebrities_auth_read"
    ON directory_celebrities
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "directory_celebrities_editor_insert" ON directory_celebrities;
CREATE POLICY "directory_celebrities_editor_insert"
    ON directory_celebrities
    FOR INSERT
    TO authenticated
    WITH CHECK (is_editor());

DROP POLICY IF EXISTS "directory_celebrities_editor_update" ON directory_celebrities;
CREATE POLICY "directory_celebrities_editor_update"
    ON directory_celebrities
    FOR UPDATE
    TO authenticated
    USING (is_editor())
    WITH CHECK (is_editor());

DROP POLICY IF EXISTS "directory_celebrities_admin_delete" ON directory_celebrities;
CREATE POLICY "directory_celebrities_admin_delete"
    ON directory_celebrities
    FOR DELETE
    TO authenticated
    USING (is_admin());

-- ---------------------------------------------------------------------------
-- directory_people
-- ---------------------------------------------------------------------------

ALTER TABLE directory_people ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "directory_people_anon_read" ON directory_people;
CREATE POLICY "directory_people_anon_read"
    ON directory_people
    FOR SELECT
    TO anon
    USING (true);

DROP POLICY IF EXISTS "directory_people_auth_read" ON directory_people;
CREATE POLICY "directory_people_auth_read"
    ON directory_people
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "directory_people_editor_insert" ON directory_people;
CREATE POLICY "directory_people_editor_insert"
    ON directory_people
    FOR INSERT
    TO authenticated
    WITH CHECK (is_editor());

DROP POLICY IF EXISTS "directory_people_editor_update" ON directory_people;
CREATE POLICY "directory_people_editor_update"
    ON directory_people
    FOR UPDATE
    TO authenticated
    USING (is_editor())
    WITH CHECK (is_editor());

DROP POLICY IF EXISTS "directory_people_admin_delete" ON directory_people;
CREATE POLICY "directory_people_admin_delete"
    ON directory_people
    FOR DELETE
    TO authenticated
    USING (is_admin());

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_anon_read" ON products;
CREATE POLICY "products_anon_read"
    ON products
    FOR SELECT
    TO anon
    USING (true);

DROP POLICY IF EXISTS "products_auth_read" ON products;
CREATE POLICY "products_auth_read"
    ON products
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "products_editor_write" ON products;
CREATE POLICY "products_editor_write"
    ON products
    FOR ALL
    TO authenticated
    USING (is_editor())
    WITH CHECK (is_editor());

-- ---------------------------------------------------------------------------
-- product_embeddings (authenticated read; service_role write)
-- ---------------------------------------------------------------------------

ALTER TABLE product_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_embeddings_auth_read" ON product_embeddings;
CREATE POLICY "product_embeddings_auth_read"
    ON product_embeddings
    FOR SELECT
    TO authenticated
    USING (true);

-- Embeddings are written by server-side jobs via service_role key (bypasses RLS).
-- No write policy needed for authenticated role.

-- ---------------------------------------------------------------------------
-- celeb_photo_embeddings (authenticated read; service_role write)
-- ---------------------------------------------------------------------------

ALTER TABLE celeb_photo_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "celeb_photo_embeddings_auth_read" ON celeb_photo_embeddings;
CREATE POLICY "celeb_photo_embeddings_auth_read"
    ON celeb_photo_embeddings
    FOR SELECT
    TO authenticated
    USING (true);

-- ---------------------------------------------------------------------------
-- users — each user sees their own row; admin sees all
-- ---------------------------------------------------------------------------

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_self_read" ON users;
CREATE POLICY "users_self_read"
    ON users
    FOR SELECT
    TO authenticated
    USING (id = current_user_id() OR is_admin());

DROP POLICY IF EXISTS "users_self_update" ON users;
CREATE POLICY "users_self_update"
    ON users
    FOR UPDATE
    TO authenticated
    USING (id = current_user_id())
    WITH CHECK (id = current_user_id());

DROP POLICY IF EXISTS "users_admin_all" ON users;
CREATE POLICY "users_admin_all"
    ON users
    FOR ALL
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- ---------------------------------------------------------------------------
-- watchlist — users own their rows
-- ---------------------------------------------------------------------------

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "watchlist_owner_all" ON watchlist;
CREATE POLICY "watchlist_owner_all"
    ON watchlist
    FOR ALL
    TO authenticated
    USING (user_id = current_user_id())
    WITH CHECK (user_id = current_user_id());

-- ---------------------------------------------------------------------------
-- boards — owner or shared
-- ---------------------------------------------------------------------------

ALTER TABLE boards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "boards_owner_or_shared_read" ON boards;
CREATE POLICY "boards_owner_or_shared_read"
    ON boards
    FOR SELECT
    TO authenticated
    USING (owner_id = current_user_id() OR is_shared = true);

DROP POLICY IF EXISTS "boards_owner_write" ON boards;
CREATE POLICY "boards_owner_write"
    ON boards
    FOR ALL
    TO authenticated
    USING (owner_id = current_user_id())
    WITH CHECK (owner_id = current_user_id());

-- ---------------------------------------------------------------------------
-- board_items — visible if board is visible
-- ---------------------------------------------------------------------------

ALTER TABLE board_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "board_items_visible_boards" ON board_items;
CREATE POLICY "board_items_visible_boards"
    ON board_items
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM boards b
            WHERE b.id = board_id
              AND (b.owner_id = current_user_id() OR b.is_shared = true)
        )
    );

DROP POLICY IF EXISTS "board_items_owner_write" ON board_items;
CREATE POLICY "board_items_owner_write"
    ON board_items
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM boards b
            WHERE b.id = board_id
              AND b.owner_id = current_user_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM boards b
            WHERE b.id = board_id
              AND b.owner_id = current_user_id()
        )
    );

-- ---------------------------------------------------------------------------
-- comments — authenticated read all; author can update/delete their own
-- ---------------------------------------------------------------------------

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments_auth_read" ON comments;
CREATE POLICY "comments_auth_read"
    ON comments
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "comments_auth_insert" ON comments;
CREATE POLICY "comments_auth_insert"
    ON comments
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "comments_author_update" ON comments;
CREATE POLICY "comments_author_update"
    ON comments
    FOR UPDATE
    TO authenticated
    USING (user_id = current_user_id())
    WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "comments_author_delete" ON comments;
CREATE POLICY "comments_author_delete"
    ON comments
    FOR DELETE
    TO authenticated
    USING (user_id = current_user_id() OR is_admin());

-- ---------------------------------------------------------------------------
-- saved_searches — users own their rows
-- ---------------------------------------------------------------------------

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_searches_owner_all" ON saved_searches;
CREATE POLICY "saved_searches_owner_all"
    ON saved_searches
    FOR ALL
    TO authenticated
    USING (user_id = current_user_id())
    WITH CHECK (user_id = current_user_id());

-- ---------------------------------------------------------------------------
-- alerts — users see their own; admin sees all
-- ---------------------------------------------------------------------------

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alerts_owner_read" ON alerts;
CREATE POLICY "alerts_owner_read"
    ON alerts
    FOR SELECT
    TO authenticated
    USING (user_id = current_user_id() OR is_admin());

DROP POLICY IF EXISTS "alerts_owner_update" ON alerts;
CREATE POLICY "alerts_owner_update"
    ON alerts
    FOR UPDATE
    TO authenticated
    USING (user_id = current_user_id())
    WITH CHECK (user_id = current_user_id());

-- Inserts are performed by service_role (cron/pipeline), not by authenticated users.

-- ---------------------------------------------------------------------------
-- audit_log — authenticated read; admin reads all; inserts by trigger only
-- ---------------------------------------------------------------------------

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_admin_read" ON audit_log;
CREATE POLICY "audit_log_admin_read"
    ON audit_log
    FOR SELECT
    TO authenticated
    USING (is_admin());

-- Inserts come from audit_log_trigger_fn() which runs as SECURITY DEFINER.
-- No INSERT policy for authenticated users is needed.

-- ---------------------------------------------------------------------------
-- feed_cron_runs — admin read only (cron writes via service_role)
-- ---------------------------------------------------------------------------

ALTER TABLE feed_cron_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feed_cron_runs_admin_read" ON feed_cron_runs;
CREATE POLICY "feed_cron_runs_admin_read"
    ON feed_cron_runs
    FOR SELECT
    TO authenticated
    USING (is_admin());
