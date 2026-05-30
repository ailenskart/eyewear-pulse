-- =============================================================================
-- 0011_cron_runs.sql
-- Lenzy v2 · Cron run log table
--
-- Every background job records a row here: start, end, success/fail, stats.
-- Powers the Admin → Cron Health dashboard.
-- Idempotent: uses CREATE TABLE IF NOT EXISTS.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS feed_cron_runs CASCADE;
-- =============================================================================

CREATE TABLE IF NOT EXISTS feed_cron_runs (

    id                  bigserial       PRIMARY KEY,

    -- Cron job identifier (matches the API route, e.g. 'ig-fast', 'celeb-scan')
    name                text            NOT NULL,

    -- Run window
    started_at          timestamptz     NOT NULL DEFAULT now(),
    ended_at            timestamptz,
    duration_ms         int             GENERATED ALWAYS AS (
                            CASE
                                WHEN ended_at IS NOT NULL
                                THEN EXTRACT(EPOCH FROM (ended_at - started_at))::int * 1000
                                ELSE NULL
                            END
                        ) STORED,

    -- Outcome
    success             boolean,
    error               text,

    -- Stats payload (job-specific metrics)
    -- Example shapes:
    --   ig-fast:    {brands_hit, new_posts, updated_posts, skipped}
    --   celeb-scan: {celebs_scanned, eyewear_detected, auto_attributed, queued_review}
    --   sitemap:    {brands_processed, urls_found, products_upserted}
    stats               jsonb           DEFAULT '{}'::jsonb,

    -- Cron trigger context
    triggered_by        text,           -- 'vercel-cron' / 'qstash' / 'manual' / 'admin'
    triggered_by_user   uuid
                            REFERENCES users(id)
                            ON DELETE SET NULL,

    created_at          timestamptz     NOT NULL DEFAULT now(),
    -- updated_at present for schema consistency; rows are effectively immutable once ended.
    updated_at          timestamptz     NOT NULL DEFAULT now()

);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Most common query: last N runs for a specific cron job
CREATE INDEX IF NOT EXISTS idx_feed_cron_runs_name_started
    ON feed_cron_runs (name, started_at DESC);

-- Global recency view (Admin → Cron Health)
CREATE INDEX IF NOT EXISTS idx_feed_cron_runs_started_at
    ON feed_cron_runs (started_at DESC);

-- Filter failed runs only
CREATE INDEX IF NOT EXISTS idx_feed_cron_runs_failures
    ON feed_cron_runs (name, started_at DESC)
    WHERE success = false;

-- GIN on stats for ad-hoc queries into stats payload
CREATE INDEX IF NOT EXISTS idx_feed_cron_runs_stats_gin
    ON feed_cron_runs USING gin (stats);

-- ---------------------------------------------------------------------------
-- No updated_at trigger needed — cron_runs rows are effectively immutable
-- once ended_at is set. We update only to write ended_at / success / stats.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE feed_cron_runs IS
    'Audit log for all background cron jobs. '
    'Every cron route writes a row on start (success=NULL) and updates it on finish. '
    'Drives the Admin → Cron Health dashboard.';

COMMENT ON COLUMN feed_cron_runs.name IS
    'Cron job name. Should match the API route segment, e.g. '
    '''ig-fast'', ''ig-mid'', ''ig-full'', ''celeb-scan'', ''sitemap-parse'', '
    '''price-snapshot'', ''linkedin-sync'', ''trends-weekly'', '
    '''digest-daily'', ''enrich-crunchbase''.';

COMMENT ON COLUMN feed_cron_runs.duration_ms IS
    'Auto-computed from started_at and ended_at. NULL while job is running.';

COMMENT ON COLUMN feed_cron_runs.stats IS
    'Job-specific metrics payload. Schema varies by cron name. '
    'Always include at minimum: {records_processed:int, errors:int}.';
