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

-- Convenience overload that accepts a JSONB task object
create or replace function pgflow.complete_task(
  task jsonb,
  output jsonb
)
returns setof pgflow.step_tasks
language sql
set search_path to ''
as $$
  select * from pgflow.complete_task(
    (task->>'run_id')::uuid,
    task->>'step_slug',
    (task->>'task_index')::int,
    output
  );
$$;
