-- Modify "step_states" table
ALTER TABLE "pgflow"."step_states" DROP CONSTRAINT "step_states_initial_tasks_check", ADD CONSTRAINT "step_states_initial_tasks_check" CHECK ((initial_tasks IS NULL) OR (initial_tasks >= 0)), ADD CONSTRAINT "initial_tasks_known_when_started" CHECK ((status <> 'started'::text) OR (initial_tasks IS NOT NULL)), ALTER COLUMN "initial_tasks" DROP NOT NULL, ALTER COLUMN "initial_tasks" DROP DEFAULT;
-- Modify "cascade_complete_taskless_steps" function
CREATE OR REPLACE FUNCTION "pgflow"."cascade_complete_taskless_steps" ("run_id" uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_total_completed int := 0;
  v_iteration_completed int;
  v_iterations int := 0;
  v_max_iterations int := 50;
BEGIN
  -- ==========================================
  -- ITERATIVE CASCADE COMPLETION
  -- ==========================================
  -- Completes taskless steps in waves until none remain
  LOOP
    -- ---------- Safety check ----------
    v_iterations := v_iterations + 1;
    IF v_iterations > v_max_iterations THEN
      RAISE EXCEPTION 'Cascade loop exceeded safety limit of % iterations', v_max_iterations;
    END IF;

    -- ==========================================
    -- COMPLETE READY TASKLESS STEPS
    -- ==========================================
    WITH completed AS (
      -- ---------- Complete taskless steps ----------
      -- Steps with initial_tasks=0 and no remaining deps
      UPDATE pgflow.step_states ss
      SET status = 'completed',
          started_at = now(),
          completed_at = now(),
          remaining_tasks = 0
      FROM pgflow.steps s
      WHERE ss.run_id = cascade_complete_taskless_steps.run_id
        AND ss.flow_slug = s.flow_slug
        AND ss.step_slug = s.step_slug
        AND ss.status = 'created'
        AND ss.remaining_deps = 0
        AND ss.initial_tasks = 0
      -- Process in topological order to ensure proper cascade
      RETURNING ss.*
    ),
    -- ---------- Update dependent steps ----------
    -- Propagate completion and empty arrays to dependents
    dep_updates AS (
      UPDATE pgflow.step_states ss
      SET remaining_deps = ss.remaining_deps - dep_count.count,
          -- If the dependent is a map step and its dependency completed with 0 tasks,
          -- set its initial_tasks to 0 as well
          initial_tasks = CASE
            WHEN s.step_type = 'map' AND dep_count.has_zero_tasks
            THEN 0  -- Empty array propagation
            ELSE ss.initial_tasks  -- Keep existing value (including NULL)
          END
      FROM (
        -- Aggregate dependency updates per dependent step
        SELECT
          d.flow_slug,
          d.step_slug as dependent_slug,
          COUNT(*) as count,
          BOOL_OR(c.initial_tasks = 0) as has_zero_tasks
        FROM completed c
        JOIN pgflow.deps d ON d.flow_slug = c.flow_slug
                           AND d.dep_slug = c.step_slug
        GROUP BY d.flow_slug, d.step_slug
      ) dep_count,
      pgflow.steps s
      WHERE ss.run_id = cascade_complete_taskless_steps.run_id
        AND ss.flow_slug = dep_count.flow_slug
        AND ss.step_slug = dep_count.dependent_slug
        AND s.flow_slug = ss.flow_slug
        AND s.step_slug = ss.step_slug
    ),
    -- ---------- Update run counters ----------
    run_updates AS (
      UPDATE pgflow.runs r
      SET remaining_steps = r.remaining_steps - c.completed_count,
          status = CASE
            WHEN r.remaining_steps - c.completed_count = 0
            THEN 'completed'
            ELSE r.status
          END,
          completed_at = CASE
            WHEN r.remaining_steps - c.completed_count = 0
            THEN now()
            ELSE r.completed_at
          END
      FROM (SELECT COUNT(*) AS completed_count FROM completed) c
      WHERE r.run_id = cascade_complete_taskless_steps.run_id
        AND c.completed_count > 0
    )
    -- ---------- Check iteration results ----------
    SELECT COUNT(*) INTO v_iteration_completed FROM completed;

    EXIT WHEN v_iteration_completed = 0;  -- No more steps to complete
    v_total_completed := v_total_completed + v_iteration_completed;
  END LOOP;

  RETURN v_total_completed;
END;
$$;
-- Modify "maybe_complete_run" function
CREATE OR REPLACE FUNCTION "pgflow"."maybe_complete_run" ("run_id" uuid) RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_completed_run pgflow.runs%ROWTYPE;
begin
  -- ==========================================
  -- CHECK AND COMPLETE RUN IF FINISHED
  -- ==========================================
  WITH run_output AS (
    -- ---------- Gather outputs from leaf steps ----------
    -- Leaf steps = steps with no dependents
    SELECT jsonb_object_agg(st.step_slug, st.output) as final_output
    FROM pgflow.step_tasks st
    JOIN pgflow.step_states ss ON ss.run_id = st.run_id AND ss.step_slug = st.step_slug
    JOIN pgflow.runs r ON r.run_id = ss.run_id AND r.flow_slug = ss.flow_slug
    WHERE st.run_id = maybe_complete_run.run_id
      AND st.status = 'completed'
      AND NOT EXISTS (
        SELECT 1
        FROM pgflow.deps d
        WHERE d.flow_slug = ss.flow_slug
          AND d.dep_slug = ss.step_slug
      )
  )
  -- ---------- Complete run if all steps done ----------
  UPDATE pgflow.runs
  SET
    status = 'completed',
    completed_at = now(),
    output = (SELECT final_output FROM run_output)
  WHERE pgflow.runs.run_id = maybe_complete_run.run_id
    AND pgflow.runs.remaining_steps = 0
    AND pgflow.runs.status != 'completed'
  RETURNING * INTO v_completed_run;

  -- ==========================================
  -- BROADCAST COMPLETION EVENT
  -- ==========================================
  IF v_completed_run.run_id IS NOT NULL THEN
    PERFORM realtime.send(
      jsonb_build_object(
        'event_type', 'run:completed',
        'run_id', v_completed_run.run_id,
        'flow_slug', v_completed_run.flow_slug,
        'status', 'completed',
        'output', v_completed_run.output,
        'completed_at', v_completed_run.completed_at
      ),
      'run:completed',
      concat('pgflow:run:', v_completed_run.run_id),
      false
    );
  END IF;
end;
$$;
-- Modify "start_ready_steps" function
CREATE OR REPLACE FUNCTION "pgflow"."start_ready_steps" ("run_id" uuid) RETURNS void LANGUAGE sql SET "search_path" = '' AS $$
-- ==========================================
-- HANDLE EMPTY ARRAY MAPS (initial_tasks = 0)
-- ==========================================
-- These complete immediately without spawning tasks
WITH empty_map_steps AS (
  SELECT step_state.*
  FROM pgflow.step_states AS step_state
  JOIN pgflow.steps AS step 
    ON step.flow_slug = step_state.flow_slug 
    AND step.step_slug = step_state.step_slug
  WHERE step_state.run_id = start_ready_steps.run_id
    AND step_state.status = 'created'
    AND step_state.remaining_deps = 0
    AND step.step_type = 'map'
    AND step_state.initial_tasks = 0
  ORDER BY step_state.step_slug
  FOR UPDATE OF step_state
),
-- ---------- Complete empty map steps ----------
completed_empty_steps AS (
  UPDATE pgflow.step_states
  SET status = 'completed',
      started_at = now(),
      completed_at = now(),
      remaining_tasks = 0
  FROM empty_map_steps
  WHERE pgflow.step_states.run_id = start_ready_steps.run_id
    AND pgflow.step_states.step_slug = empty_map_steps.step_slug
  RETURNING pgflow.step_states.*
),
-- ---------- Broadcast completion events ----------
broadcast_empty_completed AS (
  SELECT 
    realtime.send(
      jsonb_build_object(
        'event_type', 'step:completed',
        'run_id', completed_step.run_id,
        'step_slug', completed_step.step_slug,
        'status', 'completed',
        'started_at', completed_step.started_at,
        'completed_at', completed_step.completed_at,
        'remaining_tasks', 0,
        'remaining_deps', 0,
        'output', '[]'::jsonb
      ),
      concat('step:', completed_step.step_slug, ':completed'),
      concat('pgflow:run:', completed_step.run_id),
      false
    )
  FROM completed_empty_steps AS completed_step
),

-- ==========================================
-- HANDLE NORMAL STEPS (initial_tasks > 0)
-- ==========================================
-- ---------- Find ready steps ----------
-- Steps with no remaining deps and known task count
ready_steps AS (
  SELECT *
  FROM pgflow.step_states AS step_state
  WHERE step_state.run_id = start_ready_steps.run_id
    AND step_state.status = 'created'
    AND step_state.remaining_deps = 0
    AND step_state.initial_tasks IS NOT NULL  -- NEW: Cannot start with unknown count
    AND step_state.initial_tasks > 0  -- Don't start taskless steps
    -- Exclude empty map steps already handled
    AND NOT EXISTS (
      SELECT 1 FROM empty_map_steps
      WHERE empty_map_steps.run_id = step_state.run_id
        AND empty_map_steps.step_slug = step_state.step_slug
    )
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
  RETURNING pgflow.step_states.*
),

-- ==========================================
-- TASK GENERATION AND QUEUE MESSAGES
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
),

-- ---------- Broadcast step:started events ----------
broadcast_events AS (
  SELECT 
    realtime.send(
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
  FROM started_step_states AS started_step
)

-- ==========================================
-- RECORD TASKS IN DATABASE
-- ==========================================
INSERT INTO pgflow.step_tasks (flow_slug, run_id, step_slug, task_index, message_id)
SELECT
  sent_messages.flow_slug,
  sent_messages.run_id,
  sent_messages.step_slug,
  sent_messages.task_index,
  sent_messages.msg_id
FROM sent_messages;
$$;
-- Modify "complete_task" function
CREATE OR REPLACE FUNCTION "pgflow"."complete_task" ("run_id" uuid, "step_slug" text, "task_index" integer, "output" jsonb) RETURNS SETOF "pgflow"."step_tasks" LANGUAGE plpgsql SET "search_path" = '' AS $$
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
-- Modify "start_flow" function
CREATE OR REPLACE FUNCTION "pgflow"."start_flow" ("flow_slug" text, "input" jsonb, "run_id" uuid DEFAULT NULL::uuid) RETURNS SETOF "pgflow"."runs" LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_created_run pgflow.runs%ROWTYPE;
  v_root_map_count int;
begin

-- ==========================================
-- VALIDATION: Root map array input
-- ==========================================
WITH root_maps AS (
  SELECT step_slug
  FROM pgflow.steps
  WHERE steps.flow_slug = start_flow.flow_slug
    AND steps.step_type = 'map'
    AND steps.deps_count = 0
)
SELECT COUNT(*) INTO v_root_map_count FROM root_maps;

-- If we have root map steps, validate that input is an array
IF v_root_map_count > 0 THEN
  -- First check for NULL (should be caught by NOT NULL constraint, but be defensive)
  IF start_flow.input IS NULL THEN
    RAISE EXCEPTION 'Flow % has root map steps but input is NULL', start_flow.flow_slug;
  END IF;
  
  -- Then check if it's not an array
  IF jsonb_typeof(start_flow.input) != 'array' THEN
    RAISE EXCEPTION 'Flow % has root map steps but input is not an array (got %)', 
      start_flow.flow_slug, jsonb_typeof(start_flow.input);
  END IF;
END IF;

-- ==========================================
-- MAIN CTE CHAIN: Create run and step states
-- ==========================================
WITH
  -- ---------- Gather flow metadata ----------
  flow_steps AS (
    SELECT steps.flow_slug, steps.step_slug, steps.step_type, steps.deps_count
    FROM pgflow.steps
    WHERE steps.flow_slug = start_flow.flow_slug
  ),
  -- ---------- Create run record ----------
  created_run AS (
    INSERT INTO pgflow.runs (run_id, flow_slug, input, remaining_steps)
    VALUES (
      COALESCE(start_flow.run_id, gen_random_uuid()),
      start_flow.flow_slug,
      start_flow.input,
      (SELECT count(*) FROM flow_steps)
    )
    RETURNING *
  ),
  -- ---------- Create step states ----------
  -- Sets initial_tasks: known for root maps, NULL for dependent maps
  created_step_states AS (
    INSERT INTO pgflow.step_states (flow_slug, run_id, step_slug, remaining_deps, initial_tasks)
    SELECT
      fs.flow_slug,
      (SELECT created_run.run_id FROM created_run),
      fs.step_slug,
      fs.deps_count,
      -- Updated logic for initial_tasks:
      CASE
        WHEN fs.step_type = 'map' AND fs.deps_count = 0 THEN
          -- Root map: get array length from input
          CASE
            WHEN jsonb_typeof(start_flow.input) = 'array' THEN
              jsonb_array_length(start_flow.input)
            ELSE
              1
          END
        WHEN fs.step_type = 'map' AND fs.deps_count > 0 THEN
          -- Dependent map: unknown until dependencies complete
          NULL
        ELSE
          -- Single steps: always 1 task
          1
      END
    FROM flow_steps fs
  )
SELECT * FROM created_run INTO v_created_run;

-- ==========================================
-- POST-CREATION ACTIONS
-- ==========================================

-- ---------- Broadcast run:started event ----------
PERFORM realtime.send(
  jsonb_build_object(
    'event_type', 'run:started',
    'run_id', v_created_run.run_id,
    'flow_slug', v_created_run.flow_slug,
    'input', v_created_run.input,
    'status', 'started',
    'remaining_steps', v_created_run.remaining_steps,
    'started_at', v_created_run.started_at
  ),
  'run:started',
  concat('pgflow:run:', v_created_run.run_id),
  false
);

-- ---------- Complete taskless steps ----------
-- Handle empty array maps that should auto-complete
PERFORM pgflow.cascade_complete_taskless_steps(v_created_run.run_id);

-- ---------- Start initial steps ----------
-- Start root steps (those with no dependencies)
PERFORM pgflow.start_ready_steps(v_created_run.run_id);

RETURN QUERY SELECT * FROM pgflow.runs where pgflow.runs.run_id = v_created_run.run_id;

end;
$$;
