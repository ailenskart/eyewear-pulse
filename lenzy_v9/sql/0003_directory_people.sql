-- =============================================================================
-- 0003_directory_people.sql
-- Lenzy v2 · Eyewear-industry professionals directory
--
-- One row per person (denormalized). Multiple brand affiliations are stored in
-- brand_ids[] / brand_handles[]. Matches docs/04_DATA_SCHEMA.md columns plus
-- v2 additions: department, seniority, current_company_id FK, current_title,
-- outreach_status, full audit cols.
-- Idempotent: uses CREATE TABLE IF NOT EXISTS.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS directory_people CASCADE;
-- =============================================================================

-- ---------------------------------------------------------------------------
-- outreach_status check values (not an ENUM type — easier to extend)
-- ---------------------------------------------------------------------------
--   none       = not yet contacted
--   approached = initial message sent
--   talking    = active conversation
--   hired      = successfully hired / placed
--   passed     = decided not to proceed

CREATE TABLE IF NOT EXISTS directory_people (

    -- Primary key
    id                  bigserial       PRIMARY KEY,
    uuid                uuid            NOT NULL DEFAULT gen_random_uuid(),

    -- Identity
    name                text            NOT NULL,
    photo_url           text,
    bio                 text,

    -- Current role
    current_title       text,           -- v2: explicit current title field
    title               text,           -- legacy alias kept for backwards compat
    current_company_id  bigint
                            REFERENCES tracked_brands(id)
                            ON DELETE SET NULL
                            DEFERRABLE INITIALLY DEFERRED,
    company_current     text,           -- denormalized display name (fast reads)

    -- Classification
    department          text,           -- Engineering / Design / Commercial / etc.
    seniority           text            CHECK (
                            seniority IS NULL OR seniority IN (
                                'C-Level', 'VP', 'Director',
                                'Manager', 'IC', 'Founder', 'Other'
                            )
                        ),

    -- Contact
    linkedin_url        text,
    email               text,
    phone               text,
    location            text,

    -- Brand affiliations (denormalized for display performance)
    brand_ids           bigint[]        NOT NULL DEFAULT '{}',
    brand_handles       text[]          NOT NULL DEFAULT '{}',
    previous_companies  text[]          NOT NULL DEFAULT '{}',
    tenure              text,

    -- Outreach workflow
    outreach_status     text            NOT NULL DEFAULT 'none'
                                        CHECK (outreach_status IN (
                                            'none', 'approached', 'talking', 'hired', 'passed'
                                        )),
    outreach_notes      text,
    last_outreach_at    timestamptz,

    -- Tagging
    tags                text[]          NOT NULL DEFAULT '{}',

    -- Data provenance
    source              text,           -- manual / linkedin-scan / upload / xlsx_import
    provenance          jsonb           DEFAULT '{}'::jsonb,

    -- Timestamps
    added_at            timestamptz     DEFAULT now(),
    last_moved_at       timestamptz,    -- when company_current last changed
    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now()

);

-- ---------------------------------------------------------------------------
-- Unique constraints
-- ---------------------------------------------------------------------------

-- LinkedIn URL should be unique per person
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_directory_people_linkedin_url'
          AND conrelid = 'directory_people'::regclass
    ) THEN
        ALTER TABLE directory_people
            ADD CONSTRAINT uq_directory_people_linkedin_url
            UNIQUE NULLS NOT DISTINCT (linkedin_url);
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_directory_people_uuid'
          AND conrelid = 'directory_people'::regclass
    ) THEN
        ALTER TABLE directory_people
            ADD CONSTRAINT uq_directory_people_uuid UNIQUE (uuid);
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Trigram search on name
CREATE INDEX IF NOT EXISTS idx_directory_people_name_trgm
    ON directory_people USING gin (name gin_trgm_ops);

-- GIN array indexes
CREATE INDEX IF NOT EXISTS idx_directory_people_brand_ids
    ON directory_people USING gin (brand_ids);

CREATE INDEX IF NOT EXISTS idx_directory_people_brand_handles
    ON directory_people USING gin (brand_handles);

CREATE INDEX IF NOT EXISTS idx_directory_people_tags
    ON directory_people USING gin (tags);

-- B-tree filter columns
CREATE INDEX IF NOT EXISTS idx_directory_people_department
    ON directory_people (department);

CREATE INDEX IF NOT EXISTS idx_directory_people_seniority
    ON directory_people (seniority);

CREATE INDEX IF NOT EXISTS idx_directory_people_company_current
    ON directory_people (company_current);

CREATE INDEX IF NOT EXISTS idx_directory_people_current_company_id
    ON directory_people (current_company_id);

CREATE INDEX IF NOT EXISTS idx_directory_people_outreach_status
    ON directory_people (outreach_status);

CREATE INDEX IF NOT EXISTS idx_directory_people_added_at
    ON directory_people (added_at DESC);

CREATE INDEX IF NOT EXISTS idx_directory_people_last_moved_at
    ON directory_people (last_moved_at DESC NULLS LAST);

-- Partial: recently moved (powers the /feed recently-moved widget)
CREATE INDEX IF NOT EXISTS idx_directory_people_recently_moved
    ON directory_people (last_moved_at DESC)
    WHERE last_moved_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_directory_people_updated_at ON directory_people;
CREATE TRIGGER trg_directory_people_updated_at
    BEFORE UPDATE ON directory_people
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Detect company change and stamp last_moved_at automatically
CREATE OR REPLACE FUNCTION detect_person_company_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.company_current IS DISTINCT FROM NEW.company_current
       OR OLD.current_company_id IS DISTINCT FROM NEW.current_company_id
    THEN
        NEW.last_moved_at := now();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_directory_people_company_change ON directory_people;
CREATE TRIGGER trg_directory_people_company_change
    BEFORE UPDATE ON directory_people
    FOR EACH ROW EXECUTE FUNCTION detect_person_company_change();

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE directory_people IS
    'Denormalized directory of eyewear-industry professionals. '
    'One row per person; brand affiliations stored in brand_ids[] and brand_handles[]. '
    'Linked to tracked_brands via current_company_id FK.';

COMMENT ON COLUMN directory_people.outreach_status IS
    'Tracks talent-outreach pipeline stage. '
    'Values: none | approached | talking | hired | passed.';

COMMENT ON COLUMN directory_people.last_moved_at IS
    'Stamped automatically when company_current or current_company_id changes. '
    'Powers the "recently moved" feed widget.';
