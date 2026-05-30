-- =============================================================================
-- 0001_extensions_and_helpers.sql
-- Lenzy v2 · Supabase Postgres Pro
--
-- Installs required extensions and shared helper functions.
-- Idempotent: safe to run multiple times.
--
-- ROLLBACK (destructive — run only to fully tear down):
--   DROP FUNCTION IF EXISTS set_updated_at() CASCADE;
--   DROP FUNCTION IF EXISTS slugify(text) CASCADE;
--   DROP FUNCTION IF EXISTS audit_log_trigger_fn() CASCADE;
--   -- Do NOT drop extensions in production without confirming no dependents.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";        -- gen_random_uuid(), crypt()
CREATE EXTENSION IF NOT EXISTS "vector";          -- pgvector — vector type + HNSW
CREATE EXTENSION IF NOT EXISTS "pg_trgm";         -- trigram similarity indexes

-- ---------------------------------------------------------------------------
-- 2. updated_at trigger function
--    Usage: attach via  TRIGGER trg_<table>_updated_at
--           BEFORE UPDATE ON <table> EXECUTE FUNCTION set_updated_at();
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_updated_at() IS
    'Automatically stamps updated_at = now() on every UPDATE. '
    'Attach as a BEFORE UPDATE trigger on any table that has an updated_at column.';

-- ---------------------------------------------------------------------------
-- 3. slugify(text) — URL-safe lowercase slug
--    e.g. slugify('Ray-Ban Official') → 'ray-ban-official'
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION slugify(p_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE STRICT
AS $$
DECLARE
    v_slug text;
BEGIN
    -- Lower-case
    v_slug := lower(p_input);
    -- Transliterate common accented chars to ASCII equivalents
    v_slug := translate(v_slug,
        'àáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿ',
        'aaaaaaaceeeeiiiidnoooooouuuuypy');
    -- Replace anything that is not alphanumeric or hyphen with a hyphen
    v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
    -- Trim leading/trailing hyphens
    v_slug := trim(both '-' from v_slug);
    RETURN v_slug;
END;
$$;

COMMENT ON FUNCTION slugify(text) IS
    'Produces a URL-safe lowercase slug from a display name. '
    'Example: slugify(''Ray-Ban Official'') → ''ray-ban-official''.';

-- ---------------------------------------------------------------------------
-- 4. audit_log_trigger_fn
--    Writes INSERT / UPDATE / DELETE events to the audit_log table.
--    Table audit_log must exist (created in 0010_audit_log.sql).
--    This function is defined here so the trigger can reference it from
--    any table; the triggers themselves are created in 0010_audit_log.sql.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION audit_log_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_action     text;
    v_old_data   jsonb;
    v_new_data   jsonb;
    v_user_id    uuid;
BEGIN
    v_action := TG_OP;  -- 'INSERT', 'UPDATE', or 'DELETE'

    -- Attempt to read the current Supabase/PostgREST user claim; fall back to NULL.
    BEGIN
        v_user_id := (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
    END;

    IF v_action = 'DELETE' THEN
        v_old_data := to_jsonb(OLD);
        v_new_data := NULL;
    ELSIF v_action = 'INSERT' THEN
        v_old_data := NULL;
        v_new_data := to_jsonb(NEW);
    ELSE  -- UPDATE
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
    END IF;

    INSERT INTO audit_log (
        user_id,
        action,
        entity_type,
        entity_id,
        before_data,
        after_data
    ) VALUES (
        v_user_id,
        v_action,
        TG_TABLE_NAME,
        CASE
            WHEN v_action = 'DELETE' THEN (v_old_data ->> 'id')::bigint
            ELSE (v_new_data ->> 'id')::bigint
        END,
        v_old_data,
        v_new_data
    );

    RETURN NULL;  -- AFTER trigger; return value is ignored
END;
$$;

COMMENT ON FUNCTION audit_log_trigger_fn() IS
    'AFTER INSERT/UPDATE/DELETE trigger that appends a row to audit_log. '
    'Reads the Supabase JWT sub claim for user attribution when available. '
    'Triggers referencing this function are defined in 0010_audit_log.sql.';
