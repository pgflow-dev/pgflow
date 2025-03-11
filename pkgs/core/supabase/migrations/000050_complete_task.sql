create or replace function pgflow.complete_task(
    run_id uuid,
    step_slug text,
    task_index int,
    output jsonb
)
returns void
language plpgsql
volatile
set search_path to ''
as $$
begin

WITH step_lock AS (
  -- Acquire a row-level lock on the step_states row
  SELECT * FROM pgflow.step_states
  WHERE run_id = complete_task.run_id
    AND step_slug = complete_task.step_slug
  FOR UPDATE
),
task AS (
  UPDATE pgflow.step_tasks
  SET
    status = 'completed',
    output = complete_task.output
  WHERE run_id = complete_task.run_id
    AND step_slug = complete_task.step_slug
    AND task_index = complete_task.task_index
  RETURNING *
),
step_state AS (
  UPDATE pgflow.step_states
  SET
    status = CASE
    WHEN pgflow.step_states.remaining_tasks = 1 THEN 'completed'  -- Will be 0 after decrement
    ELSE 'started'
    END,
    remaining_tasks = pgflow.step_states.remaining_tasks - 1
  FROM task
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug = complete_task.step_slug
  RETURNING pgflow.step_states.*
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
)
-- Update all dependent steps
UPDATE pgflow.step_states
SET remaining_deps = pgflow.step_states.remaining_deps - 1
FROM dependent_steps
WHERE pgflow.step_states.run_id = complete_task.run_id
  AND pgflow.step_states.step_slug = dependent_steps.dependent_step_slug;

PERFORM pgflow.start_ready_steps(complete_task.run_id);

end;
$$;
