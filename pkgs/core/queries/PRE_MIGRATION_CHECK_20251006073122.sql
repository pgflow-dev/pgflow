-- ================================================================================
-- PRE-MIGRATION CHECK for 20251006073122_pgflow_add_map_step_type.sql
-- ================================================================================
-- Purpose: Verify the migration will succeed cleanly on your database
-- When to run: BEFORE applying the migration
-- What to do with output:
--   - ✅ Only INFO rows? You're good to migrate
--   - ⚠️  ISSUE_1/ISSUE_2? Safe - migration auto-fixes these
--   - 🆘 Unexpected issues? Copy/paste output to Discord for help
-- ================================================================================

WITH issues AS (
  -- Issue 1: Created steps with remaining_tasks (will be set to NULL)
  SELECT
    1 AS priority,
    'ISSUE_1_AUTO_FIXED' AS type,
    format('run=%s step=%s',
      LEFT(run_id::text, 8),
      step_slug
    ) AS identifier,
    format('status=%s remaining_tasks=%s → will set to NULL',
      status,
      remaining_tasks
    ) AS details
  FROM pgflow.step_states
  WHERE status = 'created' AND remaining_tasks IS NOT NULL

  UNION ALL

  -- Issue 2: Started steps (will backfill initial_tasks)
  SELECT
    2 AS priority,
    'ISSUE_2_AUTO_FIXED' AS type,
    format('run=%s step=%s',
      LEFT(run_id::text, 8),
      step_slug
    ) AS identifier,
    format('status=%s → will set initial_tasks=%s',
      status,
      COALESCE(remaining_tasks::text, '1')
    ) AS details
  FROM pgflow.step_states
  WHERE status = 'started'

  UNION ALL

  -- Info: Summary stats
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
-- type                  | identifier              | details
-- ----------------------|-------------------------|---------------------------
-- ISSUE_1_AUTO_FIXED    | run=abc12345 step=foo   | Will be cleaned up
-- ISSUE_2_AUTO_FIXED    | run=def67890 step=bar   | Will be backfilled
-- INFO_SUMMARY          | total_step_states=42    | Overall stats
--
-- ✅ Safe to migrate if you only see ISSUE_1/ISSUE_2 + INFO_SUMMARY
-- ================================================================================
