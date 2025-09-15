create or replace function pgflow.start_ready_steps(run_id uuid)
returns void
language plpgsql
set search_path to ''
as $$
declare
  v_dummy int;
begin
RAISE NOTICE 'start_ready_steps called for run_id: %', start_ready_steps.run_id;
RAISE NOTICE 'Ready steps: %', (
  SELECT string_agg(step_slug, ', ')
  FROM pgflow.step_states ss
  WHERE ss.run_id = start_ready_steps.run_id
    AND ss.status = 'created'
    AND ss.remaining_deps = 0
    AND ss.initial_tasks > 0
);

-- Handle all ready steps that have tasks to spawn (initial_tasks > 0)
-- Empty map steps (initial_tasks = 0) are now handled by cascade_complete_taskless_steps
WITH ready_steps AS (
  SELECT *
  FROM pgflow.step_states AS step_state
  WHERE step_state.run_id = start_ready_steps.run_id
    AND step_state.status = 'created'
    AND step_state.remaining_deps = 0
    AND step_state.initial_tasks > 0  -- Only handle steps with tasks to spawn
  ORDER BY step_state.step_slug
  FOR UPDATE
),
started_step_states AS (
  UPDATE pgflow.step_states
  SET status = 'started',
      started_at = now(),
      remaining_tasks = ready_steps.initial_tasks  -- Copy initial_tasks to remaining_tasks when starting
  FROM ready_steps
  WHERE pgflow.step_states.run_id = start_ready_steps.run_id
    AND pgflow.step_states.step_slug = ready_steps.step_slug
  RETURNING pgflow.step_states.*
),

-- Generate tasks based on initial_tasks count
-- For single steps: initial_tasks = 1, so generate_series(0, 0) = single task with index 0
-- For map steps: initial_tasks = N, so generate_series(0, N-1) = N tasks with indices 0..N-1
-- Group messages by step for batch sending
message_batches AS (
  SELECT
    started_step.flow_slug,
    started_step.run_id,
    started_step.step_slug,
    COALESCE(step.opt_start_delay, 0) as delay,
    array_agg(
      jsonb_build_object(
        'flow_slug', started_step.flow_slug,
        'run_id', started_step.run_id,
        'step_slug', started_step.step_slug,
        'task_index', task_idx.task_index
      ) ORDER BY task_idx.task_index
    ) AS messages,
    array_agg(task_idx.task_index ORDER BY task_idx.task_index) AS task_indices
  FROM started_step_states AS started_step
  JOIN pgflow.steps AS step
    ON step.flow_slug = started_step.flow_slug
    AND step.step_slug = started_step.step_slug
  -- Generate task indices from 0 to initial_tasks-1
  CROSS JOIN LATERAL generate_series(0, started_step.initial_tasks - 1) AS task_idx(task_index)
  GROUP BY started_step.flow_slug, started_step.run_id, started_step.step_slug, step.opt_start_delay
),
-- Send messages in batch for better performance with large arrays
sent_messages AS (
  SELECT
    mb.flow_slug,
    mb.run_id,
    mb.step_slug,
    task_indices.task_index,
    msg_ids.msg_id
  FROM message_batches mb
  CROSS JOIN LATERAL unnest(mb.task_indices) WITH ORDINALITY AS task_indices(task_index, idx_ord)
  CROSS JOIN LATERAL pgmq.send_batch(mb.flow_slug, mb.messages, mb.delay) WITH ORDINALITY AS msg_ids(msg_id, msg_ord)
  WHERE task_indices.idx_ord = msg_ids.msg_ord
)

-- Insert all generated tasks with their respective task_index values
INSERT INTO pgflow.step_tasks (flow_slug, run_id, step_slug, task_index, message_id)
SELECT
  sent_messages.flow_slug,
  sent_messages.run_id,
  sent_messages.step_slug,
  sent_messages.task_index,
  sent_messages.msg_id
FROM sent_messages;

-- Send broadcast events for all started steps
PERFORM realtime.send(
  jsonb_build_object(
    'event_type', 'step:started',
    'run_id', started_step.run_id,
    'step_slug', started_step.step_slug,
    'status', 'started',
    'started_at', started_step.started_at,
    'remaining_tasks', started_step.remaining_tasks,
    'remaining_deps', started_step.remaining_deps
  ),
  concat('step:', started_step.step_slug, ':started'),
  concat('pgflow:run:', started_step.run_id),
  false
)
FROM pgflow.step_states AS started_step
WHERE started_step.run_id = start_ready_steps.run_id
  AND started_step.status = 'started'
  AND started_step.started_at >= now() - interval '1 second';

end;
$$;
