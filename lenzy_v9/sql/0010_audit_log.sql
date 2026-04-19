-- =============================================================================
-- 0010_audit_log.sql
-- Lenzy v2 · Audit log table + Postgres triggers
--
-- audit_log is populated entirely by Postgres triggers (not application code).
-- The trigger function audit_log_trigger_fn() is defined in 0001.
-- Triggers are attached here to: tracked_brands, directory_people,
-- directory_celebrities, brand_content.
--
-- workspace_id is included from day one for multi-tenant (nullable, unused v1).
-- Idempotent: CREATE TABLE IF NOT EXISTS; triggers use DROP + CREATE.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_audit_tracked_brands ON tracked_brands;
--   DROP TRIGGER IF EXISTS trg_audit_directory_people ON directory_people;
--   DROP TRIGGER IF EXISTS trg_audit_directory_celebrities ON directory_celebrities;
--   DROP TRIGGER IF EXISTS trg_audit_brand_content ON brand_content;
--   DROP TABLE IF EXISTS audit_log CASCADE;
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_log (

    id                  bigserial       PRIMARY KEY,

    -- Who made the change (NULL for service-role / cron operations)
    user_id             uuid
                            REFERENCES users(id)
                            ON DELETE SET NULL,

    -- What happened
    action              text            NOT NULL
                                        CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),

    -- What was changed
    entity_type         text            NOT NULL,   -- table name, e.g. 'tracked_brands'
    entity_id           bigint,                      -- PK of the affected row

    -- Row snapshots (NULL where not applicable)
    before_data         jsonb,          -- full row BEFORE the change (NULL for INSERT)
    after_data          jsonb,          -- full row AFTER  the change (NULL for DELETE)

    -- Multi-tenant placeholder (nullable, unused v1)
    workspace_id        uuid,

    -- When
    at                  timestamptz     NOT NULL DEFAULT now(),

    -- Session context captured at trigger time
    session_app         text            GENERATED ALWAYS AS
                            (after_data ->> 'source') STORED,

    created_at          timestamptz     NOT NULL DEFAULT now(),
    -- updated_at present for schema consistency; audit rows are append-only.
    updated_at          timestamptz     NOT NULL DEFAULT now()

);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Admin audit log: entity timeline
CREATE INDEX IF NOT EXISTS idx_audit_log_entity
    ON audit_log (entity_type, entity_id, at DESC);

-- User activity feed
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id
    ON audit_log (user_id, at DESC)
    WHERE user_id IS NOT NULL;

-- Recent mutations (global audit view)
CREATE INDEX IF NOT EXISTS idx_audit_log_at
    ON audit_log (at DESC);

-- Filter by action type
CREATE INDEX IF NOT EXISTS idx_audit_log_action
    ON audit_log (action, at DESC);

-- GIN on before/after for full-text search inside mutation data
CREATE INDEX IF NOT EXISTS idx_audit_log_after_data_gin
    ON audit_log USING gin (after_data)
    WHERE after_data IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Triggers: attach audit_log_trigger_fn() to core tables
-- (function defined in 0001_extensions_and_helpers.sql)
-- ---------------------------------------------------------------------------

-- tracked_brands
DROP TRIGGER IF EXISTS trg_audit_tracked_brands ON tracked_brands;
CREATE TRIGGER trg_audit_tracked_brands
    AFTER INSERT OR UPDATE OR DELETE ON tracked_brands
    FOR EACH ROW EXECUTE FUNCTION audit_log_trigger_fn();

-- directory_people
DROP TRIGGER IF EXISTS trg_audit_directory_people ON directory_people;
CREATE TRIGGER trg_audit_directory_people
    AFTER INSERT OR UPDATE OR DELETE ON directory_people
    FOR EACH ROW EXECUTE FUNCTION audit_log_trigger_fn();

-- directory_celebrities
DROP TRIGGER IF EXISTS trg_audit_directory_celebrities ON directory_celebrities;
CREATE TRIGGER trg_audit_directory_celebrities
    AFTER INSERT OR UPDATE OR DELETE ON directory_celebrities
    FOR EACH ROW EXECUTE FUNCTION audit_log_trigger_fn();

-- brand_content
DROP TRIGGER IF EXISTS trg_audit_brand_content ON brand_content;
CREATE TRIGGER trg_audit_brand_content
    AFTER INSERT OR UPDATE OR DELETE ON brand_content
    FOR EACH ROW EXECUTE FUNCTION audit_log_trigger_fn();

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE audit_log IS
    'Immutable record of all INSERT/UPDATE/DELETE mutations on core tables. '
    'Populated entirely by Postgres triggers — never write to this table from '
    'application code. The Admin → Audit Log UI reads from here.';

COMMENT ON COLUMN audit_log.before_data IS
    'Full JSON snapshot of the row BEFORE the mutation. NULL for INSERT.';

COMMENT ON COLUMN audit_log.after_data IS
    'Full JSON snapshot of the row AFTER the mutation. NULL for DELETE.';

COMMENT ON COLUMN audit_log.session_app IS
    'Derived column: source field from after_data if present (e.g. ''cron'', ''xlsx_import'').';
