-- =============================================================================
-- 0040_review_queue.sql
-- Lenzy v2 · Editor Review Queue materialized view
--
-- Shows brand_content rows where:
--   - type = 'unattributed_photo'
--   - is_active = true
--   - attribution.confidence is between 0.5 and 0.75 (mid-confidence match)
--     OR attribution is NULL (not yet processed — include in review backlog)
--
-- Materialized for performance (the vision pipeline writes thousands of rows;
-- the review queue should not recompute on every page load).
-- Refresh: CALL refresh_review_queue(); or scheduled via pg_cron.
-- Idempotent.
--
-- ROLLBACK:
--   DROP MATERIALIZED VIEW IF EXISTS mv_editor_review_queue;
--   DROP FUNCTION IF EXISTS refresh_review_queue();
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Materialized view
-- ---------------------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS mv_editor_review_queue;

CREATE MATERIALIZED VIEW mv_editor_review_queue AS
SELECT
    bc.id                                                   AS content_id,
    bc.brand_id,
    tb.handle                                               AS brand_handle,
    tb.name                                                 AS brand_name,
    bc.celebrity_id,
    dc.name                                                 AS celebrity_name,
    bc.image_url,
    bc.image_blob_url,
    bc.occurred_at,
    bc.ingested_at,
    bc.source_platform,
    bc.source_ref,
    bc.vision,
    bc.attribution,
    -- Confidence extracted for sort/display
    (bc.attribution ->> 'confidence')::numeric              AS confidence,
    -- Attribution method for display
    bc.attribution ->> 'method'                             AS attribution_method,
    -- Top-k candidates for the editor to choose from
    bc.attribution -> 'top_k'                               AS top_k_candidates,
    -- Status flag: 'pending_review' or 'unprocessed'
    CASE
        WHEN (bc.attribution ->> 'confidence')::numeric BETWEEN 0.5 AND 0.75
            THEN 'mid_confidence'
        ELSE 'unprocessed'
    END                                                     AS queue_reason,
    bc.created_at,
    bc.updated_at
FROM brand_content bc
LEFT JOIN tracked_brands tb
    ON tb.id = bc.brand_id
LEFT JOIN directory_celebrities dc
    ON dc.id = bc.celebrity_id
WHERE
    bc.type = 'unattributed_photo'
    AND bc.is_active = true
    AND (
        -- Mid-confidence match: pipeline ran, needs human review
        (bc.attribution ->> 'confidence')::numeric BETWEEN 0.5 AND 0.75
        -- OR: pipeline hasn't processed this yet (backlog)
        OR bc.attribution IS NULL
        OR bc.attribution = '{}'::jsonb
        OR bc.attribution ->> 'confidence' IS NULL
    )
ORDER BY
    -- Mid-confidence (actionable) first, then unprocessed
    CASE
        WHEN (bc.attribution ->> 'confidence')::numeric BETWEEN 0.5 AND 0.75
            THEN 0
        ELSE 1
    END,
    -- Within mid-confidence: highest confidence first (easiest to confirm)
    (bc.attribution ->> 'confidence')::numeric DESC NULLS LAST,
    -- Recency: most recently ingested first
    bc.ingested_at DESC;

-- ---------------------------------------------------------------------------
-- Indexes on the materialized view
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_review_queue_content_id
    ON mv_editor_review_queue (content_id);

CREATE INDEX IF NOT EXISTS idx_mv_review_queue_confidence
    ON mv_editor_review_queue (confidence DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_mv_review_queue_queue_reason
    ON mv_editor_review_queue (queue_reason);

CREATE INDEX IF NOT EXISTS idx_mv_review_queue_celebrity_id
    ON mv_editor_review_queue (celebrity_id)
    WHERE celebrity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mv_review_queue_brand_id
    ON mv_editor_review_queue (brand_id)
    WHERE brand_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Refresh helper (callable from Supabase Functions or pg_cron)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION refresh_review_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_editor_review_queue;
END;
$$;

COMMENT ON FUNCTION refresh_review_queue() IS
    'Refreshes mv_editor_review_queue concurrently (no lock). '
    'Called after the vision pipeline finishes a batch, or via pg_cron. '
    'Example pg_cron schedule (every 15 min): '
    'SELECT cron.schedule(''refresh-review-queue'', ''*/15 * * * *'', '
    '$$CALL refresh_review_queue()$$);';

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

COMMENT ON MATERIALIZED VIEW mv_editor_review_queue IS
    'Editor Review Queue: brand_content rows of type unattributed_photo that '
    'either have mid-confidence attribution (0.5–0.75) awaiting human confirmation, '
    'or have not yet been processed by the vision pipeline. '
    'Refresh after each vision pipeline batch with: SELECT refresh_review_queue();';

-- ---------------------------------------------------------------------------
-- Grant read access to authenticated users
-- (RLS does not apply to materialized views; use GRANT instead)
-- ---------------------------------------------------------------------------

REVOKE ALL ON mv_editor_review_queue FROM PUBLIC;
GRANT SELECT ON mv_editor_review_queue TO authenticated;
-- anon does not get access to the review queue
