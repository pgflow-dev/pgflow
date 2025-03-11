create or replace function pgflow.start_ready_steps(run_id uuid)
returns void
language plpgsql
set search_path to ''
as $$
begin
-- Remove the semicolon after begin

WITH ready_steps AS (
  SELECT *
  FROM pgflow.step_states AS step_state
  WHERE step_state.run_id = start_ready_steps.run_id
    AND step_state.status = 'created'
    AND step_state.remaining_deps = 0
  ORDER BY step_state.step_slug
  FOR UPDATE
),
started_step_states AS (
  UPDATE pgflow.step_states
  SET status = 'started'
  FROM ready_steps
  WHERE pgflow.step_states.run_id = start_ready_steps.run_id
    AND pgflow.step_states.step_slug = ready_steps.step_slug
  RETURNING pgflow.step_states.*
),
sent_messages AS (
  SELECT
    flow_slug, run_id, step_slug,
    pgmq.send(flow_slug, jsonb_build_object(
      'flow_slug', flow_slug,
      'run_id', run_id,
      'step_slug', step_slug,
      'task_index', 0
    )) AS msg_id
  FROM started_step_states
),
created_step_tasks AS (
  INSERT INTO pgflow.step_tasks (flow_slug, run_id, step_slug, message_id)
  SELECT
    flow_slug, run_id, step_slug, msg_id
  FROM sent_messages
)
SELECT 1;

end;
$$;
