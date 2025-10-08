-- ================================================================================
-- PRE-MIGRATION CHECK for 20251006073122_pgflow_add_map_step_type.sql
-- ================================================================================
-- Purpose: Identify data that requires migration before schema changes
-- When to run: BEFORE applying the migration
-- What to do with output:
--   - ✅ Only INFO rows? You're good to migrate
--   - ⚠️  DATA_* rows? Expected - migration handles these automatically
--   - 🆘 Unexpected rows? Copy/paste output for help
-- ================================================================================

WITH issues AS (
  -- Created steps with remaining_tasks set (should be NULL in new schema)
  SELECT
    1 AS priority,
    'DATA_CLEANUP_CREATED' AS type,
    format('run=%s step=%s',
      LEFT(run_id::text, 8),
      step_slug
    ) AS identifier,
    format('remaining_tasks=%s will be set to NULL (created steps not started yet)',
      remaining_tasks
    ) AS details
  FROM pgflow.step_states
  WHERE status = 'created' AND remaining_tasks IS NOT NULL

  UNION ALL

  -- Started steps that need initial_tasks backfilled
  SELECT
    2 AS priority,
    'DATA_BACKFILL_STARTED' AS type,
    format('run=%s step=%s',
      LEFT(run_id::text, 8),
      step_slug
    ) AS identifier,
    format('initial_tasks will be set to %s (inferred from remaining_tasks=%s)',
      COALESCE(remaining_tasks::text, '1'),
      COALESCE(remaining_tasks::text, 'NULL')
    ) AS details
  FROM pgflow.step_states
  WHERE status = 'started'

  UNION ALL

  -- Completed steps that need initial_tasks backfilled
  SELECT
    3 AS priority,
    'DATA_BACKFILL_COMPLETED' AS type,
    format('Found %s completed steps', COUNT(*)) AS identifier,
    format('initial_tasks will be set to 1 (old schema enforced single-task)',
      ''
    ) AS details
  FROM pgflow.step_states
  WHERE status = 'completed'
  HAVING COUNT(*) > 0

  UNION ALL

  -- Summary stats
  SELECT
    999 AS priority,
    'INFO_SUMMARY' AS type,
    format('total_step_states=%s', COUNT(*)) AS identifier,
    format('created=%s started=%s completed=%s failed=%s',
      COUNT(*) FILTER (WHERE status = 'created'),
      COUNT(*) FILTER (WHERE status = 'started'),
      COUNT(*) FILTER (WHERE status = 'completed'),
      COUNT(*) FILTER (WHERE status = 'failed')
    ) AS details
  FROM pgflow.step_states
)
SELECT
  type,
  identifier,
  details
FROM issues
ORDER BY priority, identifier;

-- ================================================================================
-- HOW TO READ THE OUTPUT:
-- ================================================================================
-- type                       | identifier              | details
-- ---------------------------|-------------------------|-----------------------------
-- DATA_CLEANUP_CREATED       | run=abc12345 step=foo   | Cleanup needed
-- DATA_BACKFILL_STARTED      | run=def67890 step=bar   | Backfill needed
-- DATA_BACKFILL_COMPLETED    | Found 100 completed...  | Backfill needed
-- INFO_SUMMARY               | total_step_states=114   | Overall stats
--
-- ✅ Safe to migrate - these data issues are handled automatically by the migration
-- ⚠️  CRITICAL: This migration MUST use the correct version that splits ALTER TABLE
--     statements. The packaged version combines them and will FAIL on started steps.
-- ================================================================================
