/**
 * Prunes old records from pgflow tables and PGMQ archive tables.
 *
 * @param retention_interval - Interval of recent records to keep (e.g., interval '28 days', interval '3 months')
 *
 * IMPORTANT: This function deletes ALL associated records for runs that completed or failed
 * more than retention_interval ago, regardless of individual record status. This includes:
 * - step_states with status='created' or status='started' (never executed)
 * - step_tasks with status='queued' or status='started' (never completed)
 * - PGMQ messages in active queues
 *
 * WARNING: Ensure retention_interval is longer than your longest start_delay to avoid
 * deleting tasks before they have a chance to execute.
 */
create or replace function pgflow.prune_data_older_than(
  retention_interval INTERVAL
) returns void language plpgsql as $$
DECLARE
  cutoff_timestamp TIMESTAMPTZ := now() - retention_interval;
  flow_record RECORD;
  archive_table TEXT;
  dynamic_sql TEXT;
BEGIN
  -- Delete old worker records
  DELETE FROM pgflow.workers
  WHERE last_heartbeat_at < cutoff_timestamp;

  -- Delete PGMQ messages from active queues BEFORE deleting step_tasks
  -- This prevents orphaned messages that would appear after tasks are deleted
  FOR flow_record IN
    SELECT
      r.flow_slug,
      ARRAY_AGG(st.message_id) FILTER (WHERE st.message_id IS NOT NULL) as message_ids
    FROM pgflow.runs r
    JOIN pgflow.step_tasks st ON st.run_id = r.run_id
    WHERE (
      (r.completed_at IS NOT NULL AND r.completed_at < cutoff_timestamp) OR
      (r.failed_at IS NOT NULL AND r.failed_at < cutoff_timestamp)
    )
    GROUP BY r.flow_slug
  LOOP
    -- Delete messages in batch (pgmq.delete ignores non-existent messages)
    IF flow_record.message_ids IS NOT NULL AND array_length(flow_record.message_ids, 1) > 0 THEN
      PERFORM pgmq.delete(flow_record.flow_slug, flow_record.message_ids);
    END IF;
  END LOOP;

  -- Delete ALL step_tasks for old runs (regardless of individual task status)
  -- This fixes FK constraint violation when deleting runs with unexecuted steps
  DELETE FROM pgflow.step_tasks
  WHERE run_id IN (
    SELECT run_id FROM pgflow.runs
    WHERE (
      (completed_at IS NOT NULL AND completed_at < cutoff_timestamp) OR
      (failed_at IS NOT NULL AND failed_at < cutoff_timestamp)
    )
  );

  -- Delete ALL step_states for old runs (regardless of individual step status)
  DELETE FROM pgflow.step_states
  WHERE run_id IN (
    SELECT run_id FROM pgflow.runs
    WHERE (
      (completed_at IS NOT NULL AND completed_at < cutoff_timestamp) OR
      (failed_at IS NOT NULL AND failed_at < cutoff_timestamp)
    )
  );

  -- Delete old runs records
  DELETE FROM pgflow.runs
  WHERE (
    (completed_at IS NOT NULL AND completed_at < cutoff_timestamp) OR
    (failed_at IS NOT NULL AND failed_at < cutoff_timestamp)
  );

  -- Prune archived messages from PGMQ archive tables (pgmq.a_{flow_slug})
  -- For each flow, delete old archived messages
  FOR flow_record IN SELECT DISTINCT flow_slug FROM pgflow.flows
  LOOP
    -- Build the archive table name
    archive_table := pgmq.format_table_name(flow_record.flow_slug, 'a');

    -- Check if the archive table exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'pgmq' AND table_name = archive_table
    ) THEN
      -- Build and execute a dynamic SQL statement to delete old archive records
      dynamic_sql := format('
        DELETE FROM pgmq.%I
        WHERE archived_at < $1
      ', archive_table);

      EXECUTE dynamic_sql USING cutoff_timestamp;
    END IF;
  END LOOP;
END
$$;