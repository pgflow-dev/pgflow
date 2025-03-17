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
begin

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
flow_info AS (
  SELECT r.flow_slug
  FROM pgflow.runs r
  WHERE r.run_id = fail_task.run_id
),
config AS (
  SELECT
    COALESCE(s.retry_limit, f.retry_limit) AS retry_limit,
    COALESCE(s.retry_delay, f.retry_delay) AS retry_delay
  FROM pgflow.steps s
  JOIN pgflow.flows f ON f.flow_slug = s.flow_slug
  JOIN flow_info fi ON fi.flow_slug = s.flow_slug
  WHERE s.flow_slug = fi.flow_slug AND s.step_slug = fail_task.step_slug
),
fail_or_retry_task as (
  UPDATE pgflow.step_tasks as task
  SET
    status = CASE
      WHEN task.retry_count < (SELECT retry_limit FROM config) THEN 'queued'
      ELSE 'failed'
    END,
    retry_count =
      CASE WHEN task.retry_count < (SELECT retry_limit FROM config) THEN retry_count + 1
      ELSE retry_count
    END,
    error_message = fail_task.error_message
  WHERE task.run_id = fail_task.run_id
    AND task.step_slug = fail_task.step_slug
    AND task.task_index = fail_task.task_index
    AND task.status = 'queued'
  RETURNING *
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
)
UPDATE pgflow.runs
SET status = CASE
              WHEN (select status from maybe_fail_step) = 'failed' THEN 'failed'
              ELSE status
              END
WHERE pgflow.runs.run_id = fail_task.run_id;

-- Handle message queue operations based on task status
-- For queued tasks: delay the message for retry
-- For failed tasks: archive the message
PERFORM pgmq.set_vt(r.flow_slug, st.message_id, v_retry_delay)
FROM pgflow.step_tasks st
JOIN pgflow.runs r ON st.run_id = r.run_id
WHERE st.run_id = fail_task.run_id
  AND st.step_slug = fail_task.step_slug
  AND st.task_index = fail_task.task_index
  AND st.status = 'queued';

-- For failed tasks: archive the message
PERFORM pgmq.archive(r.flow_slug, st.message_id)
FROM pgflow.step_tasks st
JOIN pgflow.runs r ON st.run_id = r.run_id
WHERE st.run_id = fail_task.run_id
  AND st.step_slug = fail_task.step_slug
  AND st.task_index = fail_task.task_index
  AND st.status = 'failed';

return query select *
from pgflow.step_tasks st
where st.run_id = fail_task.run_id
  and st.step_slug = fail_task.step_slug
  and st.task_index = fail_task.task_index;

end;
$$;
