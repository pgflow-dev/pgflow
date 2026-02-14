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
  v_run_record pgflow.runs%ROWTYPE;
  v_step_record pgflow.step_states%ROWTYPE;
begin

-- ==========================================
-- GUARD: No mutations on failed runs
-- ==========================================
IF EXISTS (SELECT 1 FROM pgflow.runs WHERE pgflow.runs.run_id = complete_task.run_id AND pgflow.runs.status = 'failed') THEN
  RETURN QUERY SELECT * FROM pgflow.step_tasks
    WHERE pgflow.step_tasks.run_id = complete_task.run_id
      AND pgflow.step_tasks.step_slug = complete_task.step_slug
      AND pgflow.step_tasks.task_index = complete_task.task_index;
  RETURN;
END IF;

-- ==========================================
-- LOCK ACQUISITION AND TYPE VALIDATION
-- ==========================================
-- Acquire locks first to prevent race conditions
SELECT * INTO v_run_record FROM pgflow.runs
WHERE pgflow.runs.run_id = complete_task.run_id
FOR UPDATE;

SELECT * INTO v_step_record FROM pgflow.step_states
WHERE pgflow.step_states.run_id = complete_task.run_id
  AND pgflow.step_states.step_slug = complete_task.step_slug
FOR UPDATE;

-- ==========================================
-- GUARD: Late callback - step not started
-- ==========================================
-- If the step is not in 'started' state, this is a late callback.
-- Do not mutate step_states or runs, archive message, return task row.
IF v_step_record.status != 'started' THEN
  -- Archive the task message if present (prevents stuck work)
  PERFORM pgmq.archive(
    v_run_record.flow_slug,
    st.message_id
  )
  FROM pgflow.step_tasks st
  WHERE st.run_id = complete_task.run_id
    AND st.step_slug = complete_task.step_slug
    AND st.task_index = complete_task.task_index
    AND st.message_id IS NOT NULL;
  -- Return the current task row without any mutations
  RETURN QUERY SELECT * FROM pgflow.step_tasks
    WHERE pgflow.step_tasks.run_id = complete_task.run_id
      AND pgflow.step_tasks.step_slug = complete_task.step_slug
      AND pgflow.step_tasks.task_index = complete_task.task_index;
  RETURN;
END IF;

-- Check for type violations AFTER acquiring locks
SELECT child_step.step_slug INTO v_dependent_map_slug
FROM pgflow.deps dependency
JOIN pgflow.steps child_step ON child_step.flow_slug = dependency.flow_slug
                             AND child_step.step_slug = dependency.step_slug
JOIN pgflow.steps parent_step ON parent_step.flow_slug = dependency.flow_slug
                              AND parent_step.step_slug = dependency.dep_slug
JOIN pgflow.step_states child_state ON child_state.flow_slug = child_step.flow_slug
                                    AND child_state.step_slug = child_step.step_slug
WHERE dependency.dep_slug = complete_task.step_slug  -- parent is the completing step
  AND dependency.flow_slug = v_run_record.flow_slug
  AND parent_step.step_type = 'single'  -- Only validate single steps
  AND child_step.step_type = 'map'
  AND child_state.run_id = complete_task.run_id
  AND child_state.initial_tasks IS NULL
  AND (complete_task.output IS NULL OR jsonb_typeof(complete_task.output) != 'array')
LIMIT 1;

-- Handle type violation if detected
IF v_dependent_map_slug IS NOT NULL THEN
  -- Mark run as failed immediately
  UPDATE pgflow.runs
  SET status = 'failed',
      failed_at = now()
  WHERE pgflow.runs.run_id = complete_task.run_id;

  -- Broadcast run:failed event
  -- Uses PERFORM pattern to ensure execution (proven reliable pattern in this function)
  PERFORM realtime.send(
    jsonb_build_object(
      'event_type', 'run:failed',
      'run_id', complete_task.run_id,
      'flow_slug', v_run_record.flow_slug,
      'status', 'failed',
      'failed_at', now()
    ),
    'run:failed',
    concat('pgflow:run:', complete_task.run_id),
    false
  );

  -- Archive all active messages (both queued and started) to prevent orphaned messages
  PERFORM pgmq.archive(
    v_run_record.flow_slug,
    array_agg(st.message_id)
  )
  FROM pgflow.step_tasks st
  WHERE st.run_id = complete_task.run_id
    AND st.status IN ('queued', 'started')
    AND st.message_id IS NOT NULL
  HAVING count(*) > 0;  -- Only call archive if there are messages to archive

  -- Mark current task as failed and store the output
  UPDATE pgflow.step_tasks
  SET status = 'failed',
      failed_at = now(),
      output = complete_task.output,  -- Store the output that caused the violation
      error_message = '[TYPE_VIOLATION] Produced ' ||
                     CASE WHEN complete_task.output IS NULL THEN 'null'
                          ELSE jsonb_typeof(complete_task.output) END ||
                     ' instead of array'
  WHERE pgflow.step_tasks.run_id = complete_task.run_id
    AND pgflow.step_tasks.step_slug = complete_task.step_slug
    AND pgflow.step_tasks.task_index = complete_task.task_index;

  -- Mark step state as failed
  UPDATE pgflow.step_states
  SET status = 'failed',
      failed_at = now(),
      error_message = '[TYPE_VIOLATION] Map step ' || v_dependent_map_slug ||
                     ' expects array input but dependency ' || complete_task.step_slug ||
                     ' produced ' || CASE WHEN complete_task.output IS NULL THEN 'null'
                                         ELSE jsonb_typeof(complete_task.output) END
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug = complete_task.step_slug;

  -- Broadcast step:failed event
  -- Uses PERFORM pattern to ensure execution (proven reliable pattern in this function)
  PERFORM realtime.send(
    jsonb_build_object(
      'event_type', 'step:failed',
      'run_id', complete_task.run_id,
      'step_slug', complete_task.step_slug,
      'status', 'failed',
      'error_message', '[TYPE_VIOLATION] Map step ' || v_dependent_map_slug ||
                      ' expects array input but dependency ' || complete_task.step_slug ||
                      ' produced ' || CASE WHEN complete_task.output IS NULL THEN 'null'
                                          ELSE jsonb_typeof(complete_task.output) END,
      'failed_at', now()
    ),
    concat('step:', complete_task.step_slug, ':failed'),
    concat('pgflow:run:', complete_task.run_id),
    false
  );

  -- Archive the current task's message (it was started, now failed)
  PERFORM pgmq.archive(
    v_run_record.flow_slug,
    st.message_id  -- Single message, use scalar form
  )
  FROM pgflow.step_tasks st
  WHERE st.run_id = complete_task.run_id
    AND st.step_slug = complete_task.step_slug
    AND st.task_index = complete_task.task_index
    AND st.message_id IS NOT NULL;

  -- Return the failed task row (API contract: always return task row)
  RETURN QUERY
  SELECT * FROM pgflow.step_tasks st
  WHERE st.run_id = complete_task.run_id
    AND st.step_slug = complete_task.step_slug
    AND st.task_index = complete_task.task_index;
  RETURN;
END IF;

-- ==========================================
-- MAIN CTE CHAIN: Update task and propagate changes
-- ==========================================
WITH
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
-- ---------- Get step type for output handling ----------
step_def AS (
  SELECT step.step_type
  FROM pgflow.steps step
  JOIN pgflow.runs run ON run.flow_slug = step.flow_slug
  WHERE run.run_id = complete_task.run_id
    AND step.step_slug = complete_task.step_slug
),
-- ---------- Step state update ----------
-- Decrement remaining_tasks and potentially mark step as completed
-- Also store output atomically with status transition to completed
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
    remaining_tasks = pgflow.step_states.remaining_tasks - 1,
    -- Store output atomically with completion (only when remaining_tasks = 1, meaning step completes)
    output = CASE
      -- Single step: store task output directly when completing
      WHEN (SELECT step_type FROM step_def) = 'single' AND pgflow.step_states.remaining_tasks = 1 THEN
        complete_task.output
      -- Map step: aggregate on completion (ordered by task_index)
      WHEN (SELECT step_type FROM step_def) = 'map' AND pgflow.step_states.remaining_tasks = 1 THEN
        (SELECT COALESCE(jsonb_agg(all_outputs.output ORDER BY all_outputs.task_index), '[]'::jsonb)
         FROM (
           -- All previously completed tasks
           SELECT st.output, st.task_index
           FROM pgflow.step_tasks st
           WHERE st.run_id = complete_task.run_id
             AND st.step_slug = complete_task.step_slug
             AND st.status = 'completed'
           UNION ALL
           -- Current task being completed (not yet visible as completed in snapshot)
           SELECT complete_task.output, complete_task.task_index
         ) all_outputs)
      ELSE pgflow.step_states.output
    END
  FROM task
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug = complete_task.step_slug
  RETURNING pgflow.step_states.*
),
-- ---------- Dependency resolution ----------
-- Find all child steps that depend on the completed parent step (only if parent completed)
child_steps AS (
  SELECT deps.step_slug AS child_step_slug
  FROM pgflow.deps deps
  JOIN step_state parent_state ON parent_state.status = 'completed' AND deps.flow_slug = parent_state.flow_slug
  WHERE deps.dep_slug = complete_task.step_slug  -- dep_slug is the parent, step_slug is the child
  ORDER BY deps.step_slug  -- Ensure consistent ordering
),
-- ---------- Lock child steps ----------
-- Acquire locks on all child steps before updating them
child_steps_lock AS (
  SELECT * FROM pgflow.step_states
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug IN (SELECT child_step_slug FROM child_steps)
  FOR UPDATE
),
-- ---------- Update child steps ----------
-- Decrement remaining_deps and resolve NULL initial_tasks for map steps
child_steps_update AS (
  UPDATE pgflow.step_states child_state
  SET remaining_deps = child_state.remaining_deps - 1,
      -- Resolve NULL initial_tasks for child map steps
      -- This is where child maps learn their array size from the parent
      -- This CTE only runs when the parent step is complete (see child_steps JOIN)
      initial_tasks = CASE
        WHEN child_step.step_type = 'map' AND child_state.initial_tasks IS NULL THEN
          CASE
            WHEN parent_step.step_type = 'map' THEN
              -- Map->map: Count all completed tasks from parent map
              -- We add 1 because the current task is being completed in this transaction
              -- but isn't yet visible as 'completed' in the step_tasks table
              -- TODO: Refactor to use future column step_states.total_tasks
              -- Would eliminate the COUNT query and just use parent_state.total_tasks
              (SELECT COUNT(*)::int + 1
               FROM pgflow.step_tasks parent_tasks
               WHERE parent_tasks.run_id = complete_task.run_id
                 AND parent_tasks.step_slug = complete_task.step_slug
                 AND parent_tasks.status = 'completed'
                 AND parent_tasks.task_index != complete_task.task_index)
            ELSE
              -- Single->map: Use output array length (single steps complete immediately)
              CASE
                WHEN complete_task.output IS NOT NULL
                     AND jsonb_typeof(complete_task.output) = 'array' THEN
                  jsonb_array_length(complete_task.output)
                ELSE NULL  -- Keep NULL if not an array
              END
          END
        ELSE child_state.initial_tasks  -- Keep existing value (including NULL)
      END
  FROM child_steps children
  JOIN pgflow.steps child_step ON child_step.flow_slug = (SELECT r.flow_slug FROM pgflow.runs r WHERE r.run_id = complete_task.run_id)
                               AND child_step.step_slug = children.child_step_slug
  JOIN pgflow.steps parent_step ON parent_step.flow_slug = (SELECT r.flow_slug FROM pgflow.runs r WHERE r.run_id = complete_task.run_id)
                                AND parent_step.step_slug = complete_task.step_slug
  WHERE child_state.run_id = complete_task.run_id
    AND child_state.step_slug = children.child_step_slug
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
  -- Broadcast step:completed event FIRST (before cascade)
  -- This ensures parent broadcasts before its dependent children
  -- Use stored output from step_states (set atomically during status transition)
  PERFORM realtime.send(
    jsonb_build_object(
      'event_type', 'step:completed',
      'run_id', complete_task.run_id,
      'step_slug', complete_task.step_slug,
      'status', 'completed',
      'output', v_step_state.output,  -- Use stored output instead of re-aggregating
      'completed_at', v_step_state.completed_at
    ),
    concat('step:', complete_task.step_slug, ':completed'),
    concat('pgflow:run:', complete_task.run_id),
    false
  );

  -- THEN evaluate conditions on newly-ready dependent steps
  -- This must happen before cascade_complete_taskless_steps so that
  -- skipped steps can set initial_tasks=0 for their map dependents
  IF NOT pgflow.cascade_resolve_conditions(complete_task.run_id) THEN
    -- Run was failed due to a condition with when_unmet='fail'
    -- Archive the current task's message before returning
    PERFORM pgmq.archive(
      (SELECT r.flow_slug FROM pgflow.runs r WHERE r.run_id = complete_task.run_id),
      (SELECT st.message_id FROM pgflow.step_tasks st
       WHERE st.run_id = complete_task.run_id
         AND st.step_slug = complete_task.step_slug
         AND st.task_index = complete_task.task_index)
    );
    RETURN QUERY SELECT * FROM pgflow.step_tasks
      WHERE pgflow.step_tasks.run_id = complete_task.run_id
        AND pgflow.step_tasks.step_slug = complete_task.step_slug
        AND pgflow.step_tasks.task_index = complete_task.task_index;
    RETURN;
  END IF;

  -- THEN cascade complete any taskless steps that are now ready
  -- This ensures dependent children broadcast AFTER their parent
  PERFORM pgflow.cascade_complete_taskless_steps(complete_task.run_id);
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
