create or replace function pgflow.fail_task(
  run_id uuid,
  step_slug text,
  task_index int,
  error_message text
)
returns setof pgflow.step_tasks
language plpgsql
volatile
set search_path to ''
as $$
declare
  v_retry_limit int := 1;
  v_retry_delay int := 1;
begin

RETURN QUERY
WITH run_lock AS (
  SELECT * FROM pgflow.runs
  WHERE pgflow.runs.run_id = fail_task.run_id
  FOR UPDATE
),
step_lock AS (
  SELECT * FROM pgflow.step_states
  WHERE pgflow.step_states.run_id = fail_task.run_id
    AND pgflow.step_states.step_slug = fail_task.step_slug
  FOR UPDATE
),
fail_or_retry_task as (
  UPDATE pgflow.step_tasks as task
  SET
    status = CASE
    WHEN task.retry_count < v_retry_limit THEN 'queued'
    ELSE 'failed'
    END,
    error_message = fail_task.error_message
  WHERE task.run_id = fail_task.run_id
    AND task.step_slug = fail_task.step_slug
    AND task.task_index = fail_task.task_index
  RETURNING *
),
maybe_delay_message AS (
  SELECT 
    pgmq.set_vt(
      (SELECT flow_slug FROM run_lock),  -- queue_name
      message_id,                        -- msg_id
      v_retry_delay                      -- vt_offset
    ) as message_delayed
  FROM fail_or_retry_task
  WHERE fail_or_retry_task.status = 'queued'
),
maybe_archive_message AS (
  SELECT 
    pgmq.archive(
      (SELECT flow_slug FROM run_lock),  -- queue_name
      message_id                         -- msg_id
    ) as message_archived
  FROM fail_or_retry_task
  WHERE fail_or_retry_task.status = 'failed'
),
maybe_fail_step AS (
  UPDATE pgflow.step_states
  SET
    status = CASE
             WHEN (select fail_or_retry_task.status from fail_or_retry_task) = 'failed' THEN 'failed'
             ELSE pgflow.step_states.status
             END
  FROM fail_or_retry_task
  WHERE pgflow.step_states.run_id = fail_task.run_id
    AND pgflow.step_states.step_slug = fail_task.step_slug
  RETURNING pgflow.step_states.*
),
maybe_fail_run AS (
  UPDATE pgflow.runs
  SET status = CASE
               WHEN (select status from maybe_fail_step) = 'failed' THEN 'failed'
               ELSE status
               END
  WHERE pgflow.runs.run_id = fail_task.run_id
  RETURNING pgflow.runs.*
)
SELECT * FROM fail_or_retry_task;

end;
$$;
