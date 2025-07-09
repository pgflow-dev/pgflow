create or replace function pgflow.start_ready_steps(run_id uuid)
returns void
language sql
set search_path to ''
as $$

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
  SET status = 'started',
      started_at = now()
  FROM ready_steps
  WHERE pgflow.step_states.run_id = start_ready_steps.run_id
    AND pgflow.step_states.step_slug = ready_steps.step_slug
  RETURNING pgflow.step_states.*
),
sent_messages AS (
  SELECT
    started_step.flow_slug,
    started_step.run_id,
    started_step.step_slug,
    pgmq.send(
      started_step.flow_slug, 
      jsonb_build_object(
        'flow_slug', started_step.flow_slug,
        'run_id', started_step.run_id,
        'step_slug', started_step.step_slug,
        'task_index', 0
      ),
      COALESCE(step.opt_start_delay, 0)
    ) AS msg_id
  FROM started_step_states AS started_step
  JOIN pgflow.steps AS step 
    ON step.flow_slug = started_step.flow_slug 
    AND step.step_slug = started_step.step_slug
),
broadcast_events AS (
  SELECT 
    realtime.send(
      jsonb_build_object(
        'event_type', 'step:started',
        'run_id', started_step.run_id,
        'step_slug', started_step.step_slug,
        'status', 'started',
        'started_at', started_step.started_at,
        'remaining_tasks', 1,
        'remaining_deps', started_step.remaining_deps
      ),
      concat('step:', started_step.step_slug, ':started'),
      concat('pgflow:run:', started_step.run_id),
      false
    )
  FROM started_step_states AS started_step
)
INSERT INTO pgflow.step_tasks (flow_slug, run_id, step_slug, message_id)
SELECT
  sent_messages.flow_slug,
  sent_messages.run_id,
  sent_messages.step_slug,
  sent_messages.msg_id
FROM sent_messages;

$$;
