-- Create "cascade_complete_taskless_steps" function
CREATE FUNCTION "pgflow"."cascade_complete_taskless_steps" ("run_id" uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_total_completed int := 0;
  v_iteration_completed int;
  v_iterations int := 0;
  v_max_iterations int := 50;
BEGIN
  LOOP
    -- Safety counter to prevent infinite loops
    v_iterations := v_iterations + 1;
    IF v_iterations > v_max_iterations THEN
      RAISE EXCEPTION 'Cascade loop exceeded safety limit of % iterations', v_max_iterations;
    END IF;

    WITH completed AS (
      -- Complete all ready taskless steps in topological order
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
    dep_updates AS (
      -- Update remaining_deps and initial_tasks for dependents of completed steps
      UPDATE pgflow.step_states ss
      SET remaining_deps = ss.remaining_deps - dep_count.count,
          -- If the dependent is a map step and its dependency completed with 0 tasks,
          -- set its initial_tasks to 0 as well
          initial_tasks = CASE
            WHEN s.step_type = 'map' AND dep_count.has_zero_tasks
            THEN 0
            ELSE ss.initial_tasks
          END
      FROM (
        -- Count how many completed steps are dependencies of each dependent
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
    run_updates AS (
      -- Update run's remaining_steps count
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
    SELECT COUNT(*) INTO v_iteration_completed FROM completed;

    EXIT WHEN v_iteration_completed = 0;
    v_total_completed := v_total_completed + v_iteration_completed;
  END LOOP;

  RETURN v_total_completed;
END;
$$;
-- Modify "complete_task" function
CREATE OR REPLACE FUNCTION "pgflow"."complete_task" ("run_id" uuid, "step_slug" text, "task_index" integer, "output" jsonb) RETURNS SETOF "pgflow"."step_tasks" LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_step_state pgflow.step_states%ROWTYPE;
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
    AND pgflow.step_tasks.status = 'started'
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
  UPDATE pgflow.step_states ss
  SET remaining_deps = ss.remaining_deps - 1,
      -- For map dependents of single steps producing arrays, set initial_tasks
      initial_tasks = CASE
        WHEN s.step_type = 'map' AND jsonb_typeof(complete_task.output) = 'array'
        THEN jsonb_array_length(complete_task.output)
        ELSE ss.initial_tasks
      END
  FROM dependent_steps ds, pgflow.steps s
  WHERE ss.run_id = complete_task.run_id
    AND ss.step_slug = ds.dependent_step_slug
    AND s.flow_slug = ss.flow_slug
    AND s.step_slug = ss.step_slug
)
-- Only decrement remaining_steps, don't update status
UPDATE pgflow.runs
SET remaining_steps = pgflow.runs.remaining_steps - 1
FROM step_state
WHERE pgflow.runs.run_id = complete_task.run_id
  AND step_state.status = 'completed';

-- Get the updated step state for broadcasting
SELECT * INTO v_step_state FROM pgflow.step_states
WHERE pgflow.step_states.run_id = complete_task.run_id AND pgflow.step_states.step_slug = complete_task.step_slug;

-- Send broadcast event for step completed if the step is completed
IF v_step_state.status = 'completed' THEN
  -- Step just completed, cascade any ready taskless steps
  PERFORM pgflow.cascade_complete_taskless_steps(complete_task.run_id);

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

-- For completed tasks: archive the message
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

PERFORM pgflow.start_ready_steps(complete_task.run_id);

PERFORM pgflow.maybe_complete_run(complete_task.run_id);

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

-- Check for root map steps and validate input
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

WITH
  flow_steps AS (
    SELECT steps.flow_slug, steps.step_slug, steps.step_type, steps.deps_count
    FROM pgflow.steps
    WHERE steps.flow_slug = start_flow.flow_slug
  ),
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
  created_step_states AS (
    INSERT INTO pgflow.step_states (flow_slug, run_id, step_slug, remaining_deps, initial_tasks)
    SELECT
      fs.flow_slug,
      (SELECT created_run.run_id FROM created_run),
      fs.step_slug,
      fs.deps_count,
      -- For root map steps (map with no deps), set initial_tasks to array length
      -- For all other steps, set initial_tasks to 1
      CASE 
        WHEN fs.step_type = 'map' AND fs.deps_count = 0 THEN 
          CASE 
            WHEN jsonb_typeof(start_flow.input) = 'array' THEN 
              jsonb_array_length(start_flow.input)
            ELSE 
              1
          END
        ELSE 
          1
      END
    FROM flow_steps fs
  )
SELECT * FROM created_run INTO v_created_run;

-- Send broadcast event for run started
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

-- Complete any taskless steps that are ready (e.g., empty array maps)
PERFORM pgflow.cascade_complete_taskless_steps(v_created_run.run_id);

PERFORM pgflow.start_ready_steps(v_created_run.run_id);

RETURN QUERY SELECT * FROM pgflow.runs where pgflow.runs.run_id = v_created_run.run_id;

end;
$$;
