-- =============================================================================
-- 0008_users_auth.sql
-- Lenzy v2 · Users / auth profile table
--
-- Extends Supabase auth.users with a profile row. The auth.users table is
-- managed by Supabase Auth; this table is the application-layer view of a user.
-- FK to auth.users(id) uses ON DELETE CASCADE so deleting from Supabase Auth
-- automatically removes the profile.
--
-- role values (CHECK constraint, not ENUM — easier to evolve):
--   admin   — full access including /admin, user management
--   editor  — read + write (write = insert/update brand content, people, celebs)
--   viewer  — read-only
--
-- workspace_id — nullable, unused today, present for future multi-tenant.
-- Idempotent: uses CREATE TABLE IF NOT EXISTS.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS users CASCADE;
--   DROP TYPE IF EXISTS user_role_enum;   -- N/A (we use CHECK, not enum)
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (

    -- Primary key mirrors Supabase Auth UUID
    id                  uuid            PRIMARY KEY
                            REFERENCES auth.users(id)
                            ON DELETE CASCADE
                            DEFERRABLE INITIALLY DEFERRED,

    -- Profile
    email               text            NOT NULL,
    name                text,
    picture             text,           -- avatar URL

    -- Role-based access control
    role                text            NOT NULL DEFAULT 'viewer'
                                        CHECK (role IN ('admin', 'editor', 'viewer')),

    -- Allow-list domain control (e.g. 'lenskart.com')
    allowlist_domain    text,

    -- Multi-tenant placeholder (nullable, unused in v1)
    workspace_id        uuid,

    -- Invite tracking
    invited_by          uuid
                            REFERENCES users(id)
                            ON DELETE SET NULL,
    invited_at          timestamptz,

    -- Activity
    last_seen_at        timestamptz,

    -- Timestamps
    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now()

);

-- ---------------------------------------------------------------------------
-- Unique constraints
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_users_email'
          AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT uq_users_email UNIQUE (email);
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_users_role
    ON users (role);

CREATE INDEX IF NOT EXISTS idx_users_workspace_id
    ON users (workspace_id)
    WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_email
    ON users (email);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-create a users profile row when a new auth.users row appears.
-- This function is called by a trigger on auth.users (set up below).
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.users (id, email, name, picture, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
        NEW.raw_user_meta_data ->> 'avatar_url',
        now(),
        now()
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- Supabase allows triggers on auth.users via security-definer functions.
-- This trigger fires after every INSERT into auth.users.
DROP TRIGGER IF EXISTS trg_auth_users_on_create ON auth.users;
CREATE TRIGGER trg_auth_users_on_create
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE users IS
    'Application-layer user profile. FK to auth.users (Supabase Auth). '
    'Created automatically when a user signs in via Google OAuth. '
    'role controls access: admin | editor | viewer.';

COMMENT ON COLUMN users.workspace_id IS
    'Nullable workspace identifier for future multi-tenant support. '
    'Not used in v1 (single-tenant Lenskart deployment). '
    'Present from day one to avoid a future ALTER TABLE migration.';

COMMENT ON COLUMN users.allowlist_domain IS
    'If set, only emails matching this domain are allowed. '
    'e.g. ''lenskart.com''. Checked at application layer by middleware.';
