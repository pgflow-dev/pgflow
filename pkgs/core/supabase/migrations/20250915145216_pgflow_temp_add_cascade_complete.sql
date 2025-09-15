-- Modify "start_ready_steps" function
CREATE OR REPLACE FUNCTION "pgflow"."start_ready_steps" ("run_id" uuid) RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
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
        'remaining_tasks', started_step.remaining_tasks,
        'remaining_deps', started_step.remaining_deps
      ),
      concat('step:', started_step.step_slug, ':started'),
      concat('pgflow:run:', started_step.run_id),
      false
    )
  FROM started_step_states AS started_step
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

end;
$$;
-- Create "cascade_complete_taskless_steps" function
CREATE FUNCTION "pgflow"."cascade_complete_taskless_steps" ("run_id" uuid) RETURNS integer LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_total_completed int := 0;
  v_iteration_completed int;
  v_iterations int := 0;
  v_max_iterations int := 50;  -- Safety limit matching worst-case analysis
begin
  loop
    -- Safety counter to prevent infinite loops
    v_iterations := v_iterations + 1;
    if v_iterations > v_max_iterations then
      raise exception 'Cascade loop exceeded safety limit of % iterations', v_max_iterations;
    end if;

    -- Complete all ready taskless steps and update dependencies in one statement
    with completed as (
      update pgflow.step_states
      set status = 'completed',
          started_at = now(),
          completed_at = now(),
          remaining_tasks = 0
      where step_states.run_id = cascade_complete_taskless_steps.run_id
        and status = 'created'
        and remaining_deps = 0
        and initial_tasks = 0
      returning *
    ),
    dep_updates as (
      update pgflow.step_states ss
      set remaining_deps = ss.remaining_deps - dep_counts.completed_deps_count,
          -- For map dependents of taskless steps, set initial_tasks to 0
          initial_tasks = case
            when st.step_type = 'map' then 0
            else ss.initial_tasks
          end
      from (
        -- Count how many dependencies completed for each dependent step
        select
          d.step_slug as dependent_step_slug,
          count(*) as completed_deps_count
        from completed c
        join pgflow.deps d on d.flow_slug = c.flow_slug
                           and d.dep_slug = c.step_slug
        where c.run_id = cascade_complete_taskless_steps.run_id
        group by d.step_slug
      ) dep_counts,
      pgflow.steps st
      where ss.run_id = cascade_complete_taskless_steps.run_id
        and ss.step_slug = dep_counts.dependent_step_slug
        and st.flow_slug = ss.flow_slug
        and st.step_slug = ss.step_slug
    ),
    -- Update runs.remaining_steps
    run_updates as (
      update pgflow.runs r
      set remaining_steps = r.remaining_steps - (
        select count(*) from completed c where c.run_id = r.run_id
      )
      where r.run_id = cascade_complete_taskless_steps.run_id
        and exists (select 1 from completed c where c.run_id = r.run_id)
    ),
    -- Send realtime events for all completed steps
    events_sent as (
      select c.*, realtime.send(
        jsonb_build_object(
          'event_type', 'step:completed',
          'run_id', c.run_id,
          'step_slug', c.step_slug,
          'status', 'completed',
          'started_at', c.started_at,
          'completed_at', c.completed_at,
          'output', '[]'::jsonb
        ),
        concat('step:', c.step_slug, ':completed'),
        concat('pgflow:run:', c.run_id),
        false
      ) as event_id
      from completed c
    )
    select count(*) into v_iteration_completed from events_sent;

    exit when v_iteration_completed = 0;
    v_total_completed := v_total_completed + v_iteration_completed;
  end loop;

  return v_total_completed;
end;
$$;
-- Modify "complete_task" function
CREATE OR REPLACE FUNCTION "pgflow"."complete_task" ("run_id" uuid, "step_slug" text, "task_index" integer, "output" jsonb) RETURNS SETOF "pgflow"."step_tasks" LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_step_state pgflow.step_states%ROWTYPE;
  v_updated_deps int;
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
    started_at = COALESCE(started_at, now()),
    completed_at = now(),
    output = complete_task.output
  WHERE pgflow.step_tasks.run_id = complete_task.run_id
    AND pgflow.step_tasks.step_slug = complete_task.step_slug
    AND pgflow.step_tasks.task_index = complete_task.task_index
    AND pgflow.step_tasks.status IN ('started', 'queued')
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

-- If the step completed, update dependent steps
IF v_step_state.status = 'completed' THEN
  -- Update remaining_deps and initial_tasks for dependent steps
  UPDATE pgflow.step_states ss
  SET remaining_deps = ss.remaining_deps - 1,
      initial_tasks = CASE
        -- Only update initial_tasks for map dependents
        WHEN dep_step.step_type = 'map' THEN
          CASE
            -- If the completed step is a single step outputting an array
            WHEN src_step.step_type = 'single' AND jsonb_typeof(complete_task.output) = 'array' THEN
              jsonb_array_length(complete_task.output)
            -- If the completed step is a map step
            WHEN src_step.step_type = 'map' THEN
              v_step_state.initial_tasks
            ELSE
              ss.initial_tasks
          END
        ELSE
          ss.initial_tasks  -- Non-map dependents keep their initial_tasks
      END
  FROM pgflow.deps d
  JOIN pgflow.steps dep_step ON dep_step.flow_slug = v_step_state.flow_slug
                              AND dep_step.step_slug = d.step_slug
  JOIN pgflow.steps src_step ON src_step.flow_slug = v_step_state.flow_slug
                              AND src_step.step_slug = complete_task.step_slug
  WHERE d.flow_slug = v_step_state.flow_slug
    AND d.dep_slug = complete_task.step_slug
    AND ss.run_id = complete_task.run_id
    AND ss.step_slug = d.step_slug;
END IF;

-- Send broadcast event for step completed if the step is completed
IF v_step_state.status = 'completed' THEN
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

-- Always cascade after completing a task, in case dependent maps became taskless
PERFORM pgflow.cascade_complete_taskless_steps(complete_task.run_id);

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

-- First cascade complete any taskless steps, then start ready steps
PERFORM pgflow.cascade_complete_taskless_steps(v_created_run.run_id);
PERFORM pgflow.start_ready_steps(v_created_run.run_id);

-- Check if the run is already complete (all taskless flow)
PERFORM pgflow.maybe_complete_run(v_created_run.run_id);

RETURN QUERY SELECT * FROM pgflow.runs where pgflow.runs.run_id = v_created_run.run_id;

end;
$$;
-- Create "complete_task" function
CREATE FUNCTION "pgflow"."complete_task" ("task" jsonb, "output" jsonb) RETURNS SETOF "pgflow"."step_tasks" LANGUAGE sql SET "search_path" = '' AS $$
select * from pgflow.complete_task(
    (task->>'run_id')::uuid,
    task->>'step_slug',
    (task->>'task_index')::int,
    output
  );
$$;
