create or replace function pgflow.start_ready_steps(run_id uuid)
returns void
language plpgsql
set search_path to ''
as $$
BEGIN
-- ==========================================
-- GUARD: No mutations on terminal runs
-- ==========================================
IF EXISTS (
  SELECT 1 FROM pgflow.runs
  WHERE pgflow.runs.run_id = start_ready_steps.run_id
    AND pgflow.runs.status IN ('failed', 'completed')
) THEN
  RETURN;
END IF;

-- ==========================================
-- PHASE 1: START READY STEPS
-- ==========================================
-- NOTE: Condition evaluation and empty map handling are done by
-- cascade_resolve_conditions() and cascade_complete_taskless_steps()
-- which are called before this function.
WITH
-- ---------- Find ready steps ----------
-- Steps with no remaining deps and known task count
ready_steps AS (
  SELECT *
  FROM pgflow.step_states AS step_state
  WHERE step_state.run_id = start_ready_steps.run_id
    AND step_state.status = 'created'
    AND step_state.remaining_deps = 0
    AND step_state.initial_tasks IS NOT NULL  -- Cannot start with unknown count
    AND step_state.initial_tasks > 0  -- Don't start taskless steps (handled by cascade_complete_taskless_steps)
  ORDER BY step_state.step_slug
  FOR UPDATE
),
-- ---------- Mark steps as started ----------
started_step_states AS (
  UPDATE pgflow.step_states
  SET status = 'started',
      started_at = now(),
      remaining_tasks = ready_steps.initial_tasks  -- Copy initial_tasks to remaining_tasks when starting
  FROM ready_steps
  WHERE pgflow.step_states.run_id = start_ready_steps.run_id
    AND pgflow.step_states.step_slug = ready_steps.step_slug
  RETURNING pgflow.step_states.*,
    -- Broadcast step:started event atomically with the UPDATE
    -- Using RETURNING ensures this executes during row processing
    -- and cannot be optimized away by the query planner
    realtime.send(
      jsonb_build_object(
        'event_type', 'step:started',
        'run_id', pgflow.step_states.run_id,
        'step_slug', pgflow.step_states.step_slug,
        'status', 'started',
        'started_at', pgflow.step_states.started_at,
        'remaining_tasks', pgflow.step_states.remaining_tasks,
        'remaining_deps', pgflow.step_states.remaining_deps
      ),
      concat('step:', pgflow.step_states.step_slug, ':started'),
      concat('pgflow:run:', pgflow.step_states.run_id),
      false
    ) as _broadcast_result  -- Prefix with _ to indicate internal use only
),

-- ==========================================
-- PHASE 2: TASK GENERATION AND QUEUE MESSAGES
-- ==========================================
-- ---------- Generate tasks and batch messages ----------
-- Single steps: 1 task (index 0)
-- Map steps: N tasks (indices 0..N-1)
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
-- ---------- Send messages to queue ----------
-- Uses batch sending for performance with large arrays
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

-- ==========================================
-- PHASE 3: RECORD TASKS IN DATABASE
-- ==========================================
INSERT INTO pgflow.step_tasks (flow_slug, run_id, step_slug, task_index, message_id)
SELECT
  sent_messages.flow_slug,
  sent_messages.run_id,
  sent_messages.step_slug,
  sent_messages.task_index,
  sent_messages.msg_id
FROM sent_messages;

END;
$$;
