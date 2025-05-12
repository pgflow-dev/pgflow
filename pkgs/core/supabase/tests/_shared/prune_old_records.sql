/**
 * Prunes old records from pgflow tables.
 *
 * @param retention_days - Number of days of recent records to keep (defaults to 28 days)
 * @return RECORD - Count of deleted records from each table
 */
create or replace function pgflow.prune_old_records(
  retention_days INTEGER default 28
) returns table (
  workers_deleted BIGINT,
  step_tasks_deleted BIGINT,
  step_states_deleted BIGINT,
  runs_deleted BIGINT
) language plpgsql as $$
DECLARE
  cutoff_timestamp TIMESTAMPTZ := now() - (retention_days * INTERVAL '1 day');
BEGIN
  -- Using a single CTE that performs all deletions and returns counts
  WITH
  workers_deleted_cte AS (
    DELETE FROM pgflow.workers
    WHERE last_heartbeat_at < cutoff_timestamp
    RETURNING *
  ),
  step_tasks_deleted_cte AS (
    DELETE FROM pgflow.step_tasks
    WHERE (
      (completed_at IS NOT NULL AND completed_at < cutoff_timestamp) OR
      (failed_at IS NOT NULL AND failed_at < cutoff_timestamp)
    )
    RETURNING *
  ),
  step_states_deleted_cte AS (
    DELETE FROM pgflow.step_states
    WHERE (
      (completed_at IS NOT NULL AND completed_at < cutoff_timestamp) OR
      (failed_at IS NOT NULL AND failed_at < cutoff_timestamp)
    )
    RETURNING *
  ),
  runs_deleted_cte AS (
    DELETE FROM pgflow.runs
    WHERE (
      (completed_at IS NOT NULL AND completed_at < cutoff_timestamp) OR
      (failed_at IS NOT NULL AND failed_at < cutoff_timestamp)
    )
    RETURNING *
  ),
  -- Count results
  counts AS (
    SELECT
      (SELECT COUNT(*) FROM workers_deleted_cte) AS workers_count,
      (SELECT COUNT(*) FROM step_tasks_deleted_cte) AS step_tasks_count,
      (SELECT COUNT(*) FROM step_states_deleted_cte) AS step_states_count,
      (SELECT COUNT(*) FROM runs_deleted_cte) AS runs_count
  )
  -- Get the counts to use in our return values
  SELECT
    workers_count,
    step_tasks_count,
    step_states_count,
    runs_count
  INTO
    workers_deleted,
    step_tasks_deleted,
    step_states_deleted,
    runs_deleted
  FROM counts;

  -- Return the values directly
  RETURN QUERY VALUES (workers_deleted, step_tasks_deleted, step_states_deleted, runs_deleted);
END
$$;
