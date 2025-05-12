/**
 * Prunes old records from pgflow tables.
 *
 * @param retention_days - Number of days of recent records to keep (defaults to 28 days)
 */
create or replace function pgflow.prune_old_records(
  retention_days INTEGER default 28
) returns void language plpgsql as $$
DECLARE
  cutoff_timestamp TIMESTAMPTZ := now() - (retention_days * INTERVAL '1 day');
BEGIN
  -- Delete old worker records
  DELETE FROM pgflow.workers
  WHERE last_heartbeat_at < cutoff_timestamp;

  -- Delete old step_tasks records
  DELETE FROM pgflow.step_tasks
  WHERE (
    (completed_at IS NOT NULL AND completed_at < cutoff_timestamp) OR
    (failed_at IS NOT NULL AND failed_at < cutoff_timestamp)
  );

  -- Delete old step_states records
  DELETE FROM pgflow.step_states
  WHERE (
    (completed_at IS NOT NULL AND completed_at < cutoff_timestamp) OR
    (failed_at IS NOT NULL AND failed_at < cutoff_timestamp)
  );

  -- Delete old runs records
  DELETE FROM pgflow.runs
  WHERE (
    (completed_at IS NOT NULL AND completed_at < cutoff_timestamp) OR
    (failed_at IS NOT NULL AND failed_at < cutoff_timestamp)
  );
END
$$;
