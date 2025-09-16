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
declare
  v_step_state pgflow.step_states%ROWTYPE;
  v_dependent_map_slug text;
begin

-- ==========================================
-- VALIDATION: Array output for dependent maps
-- ==========================================
-- Must happen BEFORE acquiring locks to fail fast without holding resources
SELECT ds.step_slug INTO v_dependent_map_slug
FROM pgflow.deps d
JOIN pgflow.steps ds ON ds.flow_slug = d.flow_slug AND ds.step_slug = d.step_slug
JOIN pgflow.step_states ss ON ss.flow_slug = ds.flow_slug AND ss.step_slug = ds.step_slug
WHERE d.dep_slug = complete_task.step_slug
  AND d.flow_slug = (SELECT r.flow_slug FROM pgflow.runs r WHERE r.run_id = complete_task.run_id)
  AND ds.step_type = 'map'
  AND ss.run_id = complete_task.run_id
  AND ss.initial_tasks IS NULL
  AND (complete_task.output IS NULL OR jsonb_typeof(complete_task.output) != 'array')
LIMIT 1;

IF v_dependent_map_slug IS NOT NULL THEN
  RAISE EXCEPTION 'Map step % expects array input but dependency % produced % (output: %)',
    v_dependent_map_slug,
    complete_task.step_slug,
    CASE WHEN complete_task.output IS NULL THEN 'null' ELSE jsonb_typeof(complete_task.output) END,
    complete_task.output;
END IF;

-- ==========================================
-- MAIN CTE CHAIN: Update task and propagate changes
-- ==========================================
WITH
-- ---------- Lock acquisition ----------
-- Acquire locks in consistent order (run -> step) to prevent deadlocks
run_lock AS (
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
-- ---------- Task completion ----------
-- Update the task record with completion status and output
task AS (
  UPDATE pgflow.step_tasks
  SET
    status = 'completed',
    completed_at = now(),
    output = complete_task.output
  WHERE pgflow.step_tasks.run_id = complete_task.run_id
    AND pgflow.step_tasks.step_slug = complete_task.step_slug
    AND pgflow.step_tasks.task_index = complete_task.task_index
    AND pgflow.step_tasks.status = 'started'
  RETURNING *
),
-- ---------- Step state update ----------
-- Decrement remaining_tasks and potentially mark step as completed
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
-- ---------- Dependency resolution ----------
-- Find all steps that depend on the completed step (only if step completed)
dependent_steps AS (
  SELECT d.step_slug AS dependent_step_slug
  FROM pgflow.deps d
  JOIN step_state s ON s.status = 'completed' AND d.flow_slug = s.flow_slug
  WHERE d.dep_slug = complete_task.step_slug
  ORDER BY d.step_slug  -- Ensure consistent ordering
),
-- ---------- Lock dependent steps ----------
-- Acquire locks on all dependent steps before updating them
dependent_steps_lock AS (
  SELECT * FROM pgflow.step_states
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug IN (SELECT dependent_step_slug FROM dependent_steps)
  FOR UPDATE
),
-- ---------- Update dependent steps ----------
-- Decrement remaining_deps and resolve NULL initial_tasks for map steps
dependent_steps_update AS (
  UPDATE pgflow.step_states ss
  SET remaining_deps = ss.remaining_deps - 1,
      -- Resolve NULL initial_tasks for dependent map steps
      -- This is where dependent maps learn their array size from upstream
      initial_tasks = CASE
        WHEN s.step_type = 'map' AND ss.initial_tasks IS NULL
             AND complete_task.output IS NOT NULL
             AND jsonb_typeof(complete_task.output) = 'array' THEN
          jsonb_array_length(complete_task.output)
        ELSE ss.initial_tasks  -- Keep existing value (including NULL)
      END
  FROM dependent_steps ds, pgflow.steps s
  WHERE ss.run_id = complete_task.run_id
    AND ss.step_slug = ds.dependent_step_slug
    AND s.flow_slug = ss.flow_slug
    AND s.step_slug = ss.step_slug
)
-- ---------- Update run remaining_steps ----------
-- Decrement the run's remaining_steps counter if step completed
UPDATE pgflow.runs
SET remaining_steps = pgflow.runs.remaining_steps - 1
FROM step_state
WHERE pgflow.runs.run_id = complete_task.run_id
  AND step_state.status = 'completed';

-- ==========================================
-- POST-COMPLETION ACTIONS
-- ==========================================

-- ---------- Get updated state for broadcasting ----------
SELECT * INTO v_step_state FROM pgflow.step_states
WHERE pgflow.step_states.run_id = complete_task.run_id AND pgflow.step_states.step_slug = complete_task.step_slug;

-- ---------- Handle step completion ----------
IF v_step_state.status = 'completed' THEN
  -- Cascade complete any taskless steps that are now ready
  PERFORM pgflow.cascade_complete_taskless_steps(complete_task.run_id);

  -- Broadcast step:completed event
  PERFORM realtime.send(
    jsonb_build_object(
      'event_type', 'step:completed',
      'run_id', complete_task.run_id,
      'step_slug', complete_task.step_slug,
      'status', 'completed',
      'output', complete_task.output,
      'completed_at', v_step_state.completed_at
    ),
    concat('step:', complete_task.step_slug, ':completed'),
    concat('pgflow:run:', complete_task.run_id),
    false
  );
END IF;

-- ---------- Archive completed task message ----------
-- Move message from active queue to archive table
PERFORM (
  WITH completed_tasks AS (
    SELECT r.flow_slug, st.message_id
    FROM pgflow.step_tasks st
    JOIN pgflow.runs r ON st.run_id = r.run_id
    WHERE st.run_id = complete_task.run_id
      AND st.step_slug = complete_task.step_slug
      AND st.task_index = complete_task.task_index
      AND st.status = 'completed'
  )
  SELECT pgmq.archive(ct.flow_slug, ct.message_id)
  FROM completed_tasks ct
  WHERE EXISTS (SELECT 1 FROM completed_tasks)
);

-- ---------- Trigger next steps ----------
-- Start any steps that are now ready (deps satisfied)
PERFORM pgflow.start_ready_steps(complete_task.run_id);

-- Check if the entire run is complete
PERFORM pgflow.maybe_complete_run(complete_task.run_id);

-- ---------- Return completed task ----------
RETURN QUERY SELECT *
FROM pgflow.step_tasks AS step_task
WHERE step_task.run_id = complete_task.run_id
  AND step_task.step_slug = complete_task.step_slug
  AND step_task.task_index = complete_task.task_index;

end;
$$;
