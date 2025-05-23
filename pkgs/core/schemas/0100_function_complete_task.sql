create or replace function pgflow.complete_task(
  run_id uuid,
  step_slug text,
  task_index int,
  output jsonb
)
returns setof pgflow.step_tasks
language plpgsql
volatile
set search_path to ''
as $$
begin

WITH run_lock AS (
  SELECT * FROM pgflow.runs
  WHERE pgflow.runs.run_id = complete_task.run_id
  FOR UPDATE
),
step_lock AS (
  SELECT * FROM pgflow.step_states
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug = complete_task.step_slug
  FOR UPDATE
),
task AS (
  UPDATE pgflow.step_tasks
  SET
    status = 'completed',
    completed_at = now(),
    output = complete_task.output
  WHERE pgflow.step_tasks.run_id = complete_task.run_id
    AND pgflow.step_tasks.step_slug = complete_task.step_slug
    AND pgflow.step_tasks.task_index = complete_task.task_index
  RETURNING *
),
step_state AS (
  UPDATE pgflow.step_states
  SET
    status = CASE
    WHEN pgflow.step_states.remaining_tasks = 1 THEN 'completed'  -- Will be 0 after decrement
    ELSE 'started'
    END,
    completed_at = CASE
    WHEN pgflow.step_states.remaining_tasks = 1 THEN now()  -- Will be 0 after decrement
    ELSE NULL
    END,
    remaining_tasks = pgflow.step_states.remaining_tasks - 1
  FROM task
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug = complete_task.step_slug
  RETURNING pgflow.step_states.*
),
-- For fanout steps that just completed all tasks, aggregate outputs
fanout_aggregation AS (
  UPDATE pgflow.step_states ss
  SET output = (
    SELECT jsonb_agg(st.output ORDER BY st.task_index)
    FROM pgflow.step_tasks st
    WHERE st.run_id = ss.run_id
      AND st.step_slug = ss.step_slug
      AND st.status = 'completed'
  )
  FROM step_state s
  JOIN pgflow.steps step ON step.flow_slug = s.flow_slug AND step.step_slug = s.step_slug
  WHERE ss.run_id = s.run_id
    AND ss.step_slug = s.step_slug
    AND s.status = 'completed'
    AND step.step_type = 'fanout'
),
-- Find all dependent steps if the current step was completed
dependent_steps AS (
  SELECT d.step_slug AS dependent_step_slug
  FROM pgflow.deps d
  JOIN step_state s ON s.status = 'completed' AND d.flow_slug = s.flow_slug
  WHERE d.dep_slug = complete_task.step_slug
  ORDER BY d.step_slug  -- Ensure consistent ordering
),
-- Lock dependent steps before updating
dependent_steps_lock AS (
  SELECT * FROM pgflow.step_states
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug IN (SELECT dependent_step_slug FROM dependent_steps)
  FOR UPDATE
),
-- Update all dependent steps
dependent_steps_update AS (
  UPDATE pgflow.step_states
  SET remaining_deps = pgflow.step_states.remaining_deps - 1
  FROM dependent_steps
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug = dependent_steps.dependent_step_slug
)
-- Only decrement remaining_steps, don't update status
UPDATE pgflow.runs
SET remaining_steps = pgflow.runs.remaining_steps - 1
FROM step_state
WHERE pgflow.runs.run_id = complete_task.run_id
  AND step_state.status = 'completed';

PERFORM pgmq.archive(
  queue_name => (SELECT run.flow_slug FROM pgflow.runs AS run WHERE run.run_id = complete_task.run_id),
  msg_id => (SELECT message_id FROM pgflow.step_tasks AS step_task
             WHERE step_task.run_id = complete_task.run_id
             AND step_task.step_slug = complete_task.step_slug
             AND step_task.task_index = complete_task.task_index)
);

PERFORM pgflow.start_ready_steps(complete_task.run_id);

PERFORM pgflow.maybe_complete_run(complete_task.run_id);

RETURN QUERY SELECT *
FROM pgflow.step_tasks AS step_task
WHERE step_task.run_id = complete_task.run_id
  AND step_task.step_slug = complete_task.step_slug
  AND step_task.task_index = complete_task.task_index;

end;
$$;
