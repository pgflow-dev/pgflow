-- Modify "step_task_record" composite type
ALTER TYPE "pgflow"."step_task_record" ADD ATTRIBUTE "task_index" integer;
-- MANUAL DATA MIGRATION: Prepare existing data for new constraint
-- This UPDATE must run BEFORE the new constraint is added to avoid failures
-- The new constraint "remaining_tasks_state_consistency" requires that
-- remaining_tasks is NULL when status = 'created'
UPDATE "pgflow"."step_states"
SET "remaining_tasks" = NULL
WHERE "status" = 'created';
-- Modify "step_states" table
ALTER TABLE "pgflow"."step_states" DROP CONSTRAINT "step_states_remaining_tasks_check", ADD CONSTRAINT "initial_tasks_known_when_started" CHECK ((status <> 'started'::text) OR (initial_tasks IS NOT NULL)), ADD CONSTRAINT "remaining_tasks_state_consistency" CHECK ((remaining_tasks IS NULL) OR (status <> 'created'::text)), ADD CONSTRAINT "step_states_initial_tasks_check" CHECK ((initial_tasks IS NULL) OR (initial_tasks >= 0)), ALTER COLUMN "remaining_tasks" DROP NOT NULL, ALTER COLUMN "remaining_tasks" DROP DEFAULT, ADD COLUMN "initial_tasks" integer NULL;
-- Modify "step_tasks" table
ALTER TABLE "pgflow"."step_tasks" DROP CONSTRAINT "only_single_task_per_step", DROP CONSTRAINT "output_valid_only_for_completed", ADD CONSTRAINT "output_valid_only_for_completed" CHECK ((output IS NULL) OR (status = ANY (ARRAY['completed'::text, 'failed'::text])));
-- Modify "steps" table
ALTER TABLE "pgflow"."steps" DROP CONSTRAINT "steps_step_type_check", ADD CONSTRAINT "steps_step_type_check" CHECK (step_type = ANY (ARRAY['single'::text, 'map'::text]));
-- Modify "maybe_complete_run" function
CREATE OR REPLACE FUNCTION "pgflow"."maybe_complete_run" ("run_id" uuid) RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_completed_run pgflow.runs%ROWTYPE;
begin
  -- ==========================================
  -- CHECK AND COMPLETE RUN IF FINISHED
  -- ==========================================
  -- ---------- Complete run if all steps done ----------
  UPDATE pgflow.runs
  SET
    status = 'completed',
    completed_at = now(),
    -- Only compute expensive aggregation when actually completing the run
    output = (
      -- ---------- Gather outputs from leaf steps ----------
      -- Leaf steps = steps with no dependents
      -- For map steps: aggregate all task outputs into array
      -- For single steps: use the single task output
      SELECT jsonb_object_agg(
        step_slug,
        CASE
          WHEN step_type = 'map' THEN aggregated_output
          ELSE single_output
        END
      )
      FROM (
        SELECT DISTINCT
          leaf_state.step_slug,
          leaf_step.step_type,
          -- For map steps: aggregate all task outputs
          CASE WHEN leaf_step.step_type = 'map' THEN
            (SELECT COALESCE(jsonb_agg(leaf_task.output ORDER BY leaf_task.task_index), '[]'::jsonb)
             FROM pgflow.step_tasks leaf_task
             WHERE leaf_task.run_id = leaf_state.run_id
               AND leaf_task.step_slug = leaf_state.step_slug
               AND leaf_task.status = 'completed')
          END as aggregated_output,
          -- For single steps: get the single output
          CASE WHEN leaf_step.step_type = 'single' THEN
            (SELECT leaf_task.output
             FROM pgflow.step_tasks leaf_task
             WHERE leaf_task.run_id = leaf_state.run_id
               AND leaf_task.step_slug = leaf_state.step_slug
               AND leaf_task.status = 'completed'
             LIMIT 1)
          END as single_output
        FROM pgflow.step_states leaf_state
        JOIN pgflow.steps leaf_step ON leaf_step.flow_slug = leaf_state.flow_slug AND leaf_step.step_slug = leaf_state.step_slug
        WHERE leaf_state.run_id = maybe_complete_run.run_id
          AND leaf_state.status = 'completed'
          AND NOT EXISTS (
            SELECT 1
            FROM pgflow.deps dep
            WHERE dep.flow_slug = leaf_state.flow_slug
              AND dep.dep_slug = leaf_state.step_slug
          )
      ) leaf_outputs
    )
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
CREATE OR REPLACE FUNCTION "pgflow"."start_ready_steps" ("run_id" uuid) RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
begin
-- ==========================================
-- GUARD: No mutations on failed runs
-- ==========================================
IF EXISTS (SELECT 1 FROM pgflow.runs WHERE pgflow.runs.run_id = start_ready_steps.run_id AND pgflow.runs.status = 'failed') THEN
  RETURN;
END IF;

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

end;
$$;
-- Create "cascade_complete_taskless_steps" function
CREATE FUNCTION "pgflow"."cascade_complete_taskless_steps" ("run_id" uuid) RETURNS integer LANGUAGE plpgsql AS $$
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
    -- Only decrement remaining_steps; let maybe_complete_run handle finalization
    run_updates AS (
      UPDATE pgflow.runs r
      SET remaining_steps = r.remaining_steps - c.completed_count
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
-- Modify "complete_task" function
CREATE OR REPLACE FUNCTION "pgflow"."complete_task" ("run_id" uuid, "step_slug" text, "task_index" integer, "output" jsonb) RETURNS SETOF "pgflow"."step_tasks" LANGUAGE plpgsql SET "search_path" = '' AS $$
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

  -- Return empty result
  RETURN QUERY SELECT * FROM pgflow.step_tasks WHERE false;
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
  -- Cascade complete any taskless steps that are now ready
  PERFORM pgflow.cascade_complete_taskless_steps(complete_task.run_id);

  -- Broadcast step:completed event
  -- For map steps, aggregate all task outputs; for single steps, use the task output
  PERFORM realtime.send(
    jsonb_build_object(
      'event_type', 'step:completed',
      'run_id', complete_task.run_id,
      'step_slug', complete_task.step_slug,
      'status', 'completed',
      'output', CASE
        WHEN (SELECT s.step_type FROM pgflow.steps s
              WHERE s.flow_slug = v_step_state.flow_slug
                AND s.step_slug = complete_task.step_slug) = 'map' THEN
          -- Aggregate all task outputs for map steps
          (SELECT COALESCE(jsonb_agg(st.output ORDER BY st.task_index), '[]'::jsonb)
           FROM pgflow.step_tasks st
           WHERE st.run_id = complete_task.run_id
             AND st.step_slug = complete_task.step_slug
             AND st.status = 'completed')
        ELSE
          -- Single step: use the individual task output
          complete_task.output
      END,
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
-- Modify "fail_task" function
CREATE OR REPLACE FUNCTION "pgflow"."fail_task" ("run_id" uuid, "step_slug" text, "task_index" integer, "error_message" text) RETURNS SETOF "pgflow"."step_tasks" LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  v_run_failed boolean;
  v_step_failed boolean;
begin

-- If run is already failed, no retries allowed
IF EXISTS (SELECT 1 FROM pgflow.runs WHERE pgflow.runs.run_id = fail_task.run_id AND pgflow.runs.status = 'failed') THEN
  UPDATE pgflow.step_tasks
  SET status = 'failed',
      failed_at = now(),
      error_message = fail_task.error_message
  WHERE pgflow.step_tasks.run_id = fail_task.run_id
    AND pgflow.step_tasks.step_slug = fail_task.step_slug
    AND pgflow.step_tasks.task_index = fail_task.task_index
    AND pgflow.step_tasks.status = 'started';

  -- Archive the task's message
  PERFORM pgmq.archive(r.flow_slug, ARRAY_AGG(st.message_id))
  FROM pgflow.step_tasks st
  JOIN pgflow.runs r ON st.run_id = r.run_id
  WHERE st.run_id = fail_task.run_id
    AND st.step_slug = fail_task.step_slug
    AND st.task_index = fail_task.task_index
    AND st.message_id IS NOT NULL
  GROUP BY r.flow_slug
  HAVING COUNT(st.message_id) > 0;

  RETURN QUERY SELECT * FROM pgflow.step_tasks
  WHERE pgflow.step_tasks.run_id = fail_task.run_id
    AND pgflow.step_tasks.step_slug = fail_task.step_slug
    AND pgflow.step_tasks.task_index = fail_task.task_index;
  RETURN;
END IF;

WITH run_lock AS (
  SELECT * FROM pgflow.runs
  WHERE pgflow.runs.run_id = fail_task.run_id
  FOR UPDATE
),
step_lock AS (
  SELECT * FROM pgflow.step_states
  WHERE pgflow.step_states.run_id = fail_task.run_id
    AND pgflow.step_states.step_slug = fail_task.step_slug
  FOR UPDATE
),
flow_info AS (
  SELECT r.flow_slug
  FROM pgflow.runs r
  WHERE r.run_id = fail_task.run_id
),
config AS (
  SELECT
    COALESCE(s.opt_max_attempts, f.opt_max_attempts) AS opt_max_attempts,
    COALESCE(s.opt_base_delay, f.opt_base_delay) AS opt_base_delay
  FROM pgflow.steps s
  JOIN pgflow.flows f ON f.flow_slug = s.flow_slug
  JOIN flow_info fi ON fi.flow_slug = s.flow_slug
  WHERE s.flow_slug = fi.flow_slug AND s.step_slug = fail_task.step_slug
),
fail_or_retry_task as (
  UPDATE pgflow.step_tasks as task
  SET
    status = CASE
      WHEN task.attempts_count < (SELECT opt_max_attempts FROM config) THEN 'queued'
      ELSE 'failed'
    END,
    failed_at = CASE
      WHEN task.attempts_count >= (SELECT opt_max_attempts FROM config) THEN now()
      ELSE NULL
    END,
    started_at = CASE
      WHEN task.attempts_count < (SELECT opt_max_attempts FROM config) THEN NULL
      ELSE task.started_at
    END,
    error_message = fail_task.error_message
  WHERE task.run_id = fail_task.run_id
    AND task.step_slug = fail_task.step_slug
    AND task.task_index = fail_task.task_index
    AND task.status = 'started'
  RETURNING *
),
maybe_fail_step AS (
  UPDATE pgflow.step_states
  SET
    status = CASE
             WHEN (select fail_or_retry_task.status from fail_or_retry_task) = 'failed' THEN 'failed'
             ELSE pgflow.step_states.status
             END,
    failed_at = CASE
                WHEN (select fail_or_retry_task.status from fail_or_retry_task) = 'failed' THEN now()
                ELSE NULL
                END,
    error_message = CASE
                    WHEN (select fail_or_retry_task.status from fail_or_retry_task) = 'failed' THEN fail_task.error_message
                    ELSE NULL
                    END
  FROM fail_or_retry_task
  WHERE pgflow.step_states.run_id = fail_task.run_id
    AND pgflow.step_states.step_slug = fail_task.step_slug
  RETURNING pgflow.step_states.*
)
-- Update run status
UPDATE pgflow.runs
SET status = CASE
              WHEN (select status from maybe_fail_step) = 'failed' THEN 'failed'
              ELSE status
              END,
    failed_at = CASE
                WHEN (select status from maybe_fail_step) = 'failed' THEN now()
                ELSE NULL
                END
WHERE pgflow.runs.run_id = fail_task.run_id
RETURNING (status = 'failed') INTO v_run_failed;

-- Check if step failed by querying the step_states table
SELECT (status = 'failed') INTO v_step_failed 
FROM pgflow.step_states 
WHERE pgflow.step_states.run_id = fail_task.run_id 
  AND pgflow.step_states.step_slug = fail_task.step_slug;

-- Send broadcast event for step failure if the step was failed
IF v_step_failed THEN
  PERFORM realtime.send(
    jsonb_build_object(
      'event_type', 'step:failed',
      'run_id', fail_task.run_id,
      'step_slug', fail_task.step_slug,
      'status', 'failed',
      'error_message', fail_task.error_message,
      'failed_at', now()
    ),
    concat('step:', fail_task.step_slug, ':failed'),
    concat('pgflow:run:', fail_task.run_id),
    false
  );
END IF;

-- Send broadcast event for run failure if the run was failed
IF v_run_failed THEN
  DECLARE
    v_flow_slug text;
  BEGIN
    SELECT flow_slug INTO v_flow_slug FROM pgflow.runs WHERE pgflow.runs.run_id = fail_task.run_id;

    PERFORM realtime.send(
      jsonb_build_object(
        'event_type', 'run:failed',
        'run_id', fail_task.run_id,
        'flow_slug', v_flow_slug,
        'status', 'failed',
        'error_message', fail_task.error_message,
        'failed_at', now()
      ),
      'run:failed',
      concat('pgflow:run:', fail_task.run_id),
      false
    );
  END;
END IF;

-- Archive all active messages (both queued and started) when run fails
IF v_run_failed THEN
  PERFORM pgmq.archive(r.flow_slug, ARRAY_AGG(st.message_id))
  FROM pgflow.step_tasks st
  JOIN pgflow.runs r ON st.run_id = r.run_id
  WHERE st.run_id = fail_task.run_id
    AND st.status IN ('queued', 'started')
    AND st.message_id IS NOT NULL
  GROUP BY r.flow_slug
  HAVING COUNT(st.message_id) > 0;
END IF;

-- For queued tasks: delay the message for retry with exponential backoff
PERFORM (
  WITH retry_config AS (
    SELECT
      COALESCE(s.opt_base_delay, f.opt_base_delay) AS base_delay
    FROM pgflow.steps s
    JOIN pgflow.flows f ON f.flow_slug = s.flow_slug
    JOIN pgflow.runs r ON r.flow_slug = f.flow_slug
    WHERE r.run_id = fail_task.run_id
      AND s.step_slug = fail_task.step_slug
  ),
  queued_tasks AS (
    SELECT
      r.flow_slug,
      st.message_id,
      pgflow.calculate_retry_delay((SELECT base_delay FROM retry_config), st.attempts_count) AS calculated_delay
    FROM pgflow.step_tasks st
    JOIN pgflow.runs r ON st.run_id = r.run_id
    WHERE st.run_id = fail_task.run_id
      AND st.step_slug = fail_task.step_slug
      AND st.task_index = fail_task.task_index
      AND st.status = 'queued'
  )
  SELECT pgmq.set_vt(qt.flow_slug, qt.message_id, qt.calculated_delay)
  FROM queued_tasks qt
  WHERE EXISTS (SELECT 1 FROM queued_tasks)
);

-- For failed tasks: archive the message
PERFORM pgmq.archive(r.flow_slug, ARRAY_AGG(st.message_id))
FROM pgflow.step_tasks st
JOIN pgflow.runs r ON st.run_id = r.run_id
WHERE st.run_id = fail_task.run_id
  AND st.step_slug = fail_task.step_slug
  AND st.task_index = fail_task.task_index
  AND st.status = 'failed'
  AND st.message_id IS NOT NULL
GROUP BY r.flow_slug
HAVING COUNT(st.message_id) > 0;

return query select *
from pgflow.step_tasks st
where st.run_id = fail_task.run_id
  and st.step_slug = fail_task.step_slug
  and st.task_index = fail_task.task_index;

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

-- ---------- Check for run completion ----------
-- If cascade completed all steps (zero-task flows), finalize the run
PERFORM pgflow.maybe_complete_run(v_created_run.run_id);

RETURN QUERY SELECT * FROM pgflow.runs where pgflow.runs.run_id = v_created_run.run_id;

end;
$$;
-- Modify "start_tasks" function
CREATE OR REPLACE FUNCTION "pgflow"."start_tasks" ("flow_slug" text, "msg_ids" bigint[], "worker_id" uuid) RETURNS SETOF "pgflow"."step_task_record" LANGUAGE sql SET "search_path" = '' AS $$
with tasks as (
    select
      task.flow_slug,
      task.run_id,
      task.step_slug,
      task.task_index,
      task.message_id
    from pgflow.step_tasks as task
    join pgflow.runs r on r.run_id = task.run_id
    where task.flow_slug = start_tasks.flow_slug
      and task.message_id = any(msg_ids)
      and task.status = 'queued'
      -- MVP: Don't start tasks on failed runs
      and r.status != 'failed'
  ),
  start_tasks_update as (
    update pgflow.step_tasks
    set
      attempts_count = attempts_count + 1,
      status = 'started',
      started_at = now(),
      last_worker_id = worker_id
    from tasks
    where step_tasks.message_id = tasks.message_id
      and step_tasks.flow_slug = tasks.flow_slug
      and step_tasks.status = 'queued'
  ),
  runs as (
    select
      r.run_id,
      r.input
    from pgflow.runs r
    where r.run_id in (select run_id from tasks)
  ),
  deps as (
    select
      st.run_id,
      st.step_slug,
      dep.dep_slug,
      -- Aggregate map outputs or use single output
      CASE
        WHEN dep_step.step_type = 'map' THEN
          -- Aggregate all task outputs ordered by task_index
          -- Use COALESCE to return empty array if no tasks
          (SELECT COALESCE(jsonb_agg(dt.output ORDER BY dt.task_index), '[]'::jsonb)
           FROM pgflow.step_tasks dt
           WHERE dt.run_id = st.run_id
             AND dt.step_slug = dep.dep_slug
             AND dt.status = 'completed')
        ELSE
          -- Single step: use the single task output
          dep_task.output
      END as dep_output
    from tasks st
    join pgflow.deps dep on dep.flow_slug = st.flow_slug and dep.step_slug = st.step_slug
    join pgflow.steps dep_step on dep_step.flow_slug = dep.flow_slug and dep_step.step_slug = dep.dep_slug
    left join pgflow.step_tasks dep_task on
      dep_task.run_id = st.run_id and
      dep_task.step_slug = dep.dep_slug and
      dep_task.status = 'completed'
      and dep_step.step_type = 'single'  -- Only join for single steps
  ),
  deps_outputs as (
    select
      d.run_id,
      d.step_slug,
      jsonb_object_agg(d.dep_slug, d.dep_output) as deps_output,
      count(*) as dep_count
    from deps d
    group by d.run_id, d.step_slug
  ),
  timeouts as (
    select
      task.message_id,
      task.flow_slug,
      coalesce(step.opt_timeout, flow.opt_timeout) + 2 as vt_delay
    from tasks task
    join pgflow.flows flow on flow.flow_slug = task.flow_slug
    join pgflow.steps step on step.flow_slug = task.flow_slug and step.step_slug = task.step_slug
  ),
  -- Batch update visibility timeouts for all messages
  set_vt_batch as (
    select pgflow.set_vt_batch(
      start_tasks.flow_slug,
      array_agg(t.message_id order by t.message_id),
      array_agg(t.vt_delay order by t.message_id)
    )
    from timeouts t
  )
  select
    st.flow_slug,
    st.run_id,
    st.step_slug,
    -- ==========================================
    -- INPUT CONSTRUCTION LOGIC
    -- ==========================================
    -- This nested CASE statement determines how to construct the input
    -- for each task based on the step type (map vs non-map).
    --
    -- The fundamental difference:
    -- - Map steps: Receive RAW array elements (e.g., just 42 or "hello")
    -- - Non-map steps: Receive structured objects with named keys
    --                  (e.g., {"run": {...}, "dependency1": {...}})
    -- ==========================================
    CASE
      -- -------------------- MAP STEPS --------------------
      -- Map steps process arrays element-by-element.
      -- Each task receives ONE element from the array at its task_index position.
      WHEN step.step_type = 'map' THEN
        -- Map steps get raw array elements without any wrapper object
        CASE
          -- ROOT MAP: Gets array from run input
          -- Example: run input = [1, 2, 3]
          --          task 0 gets: 1
          --          task 1 gets: 2
          --          task 2 gets: 3
          WHEN step.deps_count = 0 THEN
            -- Root map (deps_count = 0): no dependencies, reads from run input.
            -- Extract the element at task_index from the run's input array.
            -- Note: If run input is not an array, this will return NULL
            -- and the flow will fail (validated in start_flow).
            jsonb_array_element(r.input, st.task_index)

          -- DEPENDENT MAP: Gets array from its single dependency
          -- Example: dependency output = ["a", "b", "c"]
          --          task 0 gets: "a"
          --          task 1 gets: "b"
          --          task 2 gets: "c"
          ELSE
            -- Has dependencies (should be exactly 1 for map steps).
            -- Extract the element at task_index from the dependency's output array.
            --
            -- Why the subquery with jsonb_each?
            -- - The dependency outputs a raw array: [1, 2, 3]
            -- - deps_outputs aggregates it into: {"dep_name": [1, 2, 3]}
            -- - We need to unwrap and get just the array value
            -- - Map steps have exactly 1 dependency (enforced by add_step)
            -- - So jsonb_each will return exactly 1 row
            -- - We extract the 'value' which is the raw array [1, 2, 3]
            -- - Then get the element at task_index from that array
            (SELECT jsonb_array_element(value, st.task_index)
            FROM jsonb_each(dep_out.deps_output)
            LIMIT 1)
        END

      -- -------------------- NON-MAP STEPS --------------------
      -- Regular (non-map) steps receive ALL inputs as a structured object.
      -- This includes the original run input plus all dependency outputs.
      ELSE
        -- Non-map steps get structured input with named keys
        -- Example output: {
        --   "run": {"original": "input"},
        --   "step1": {"output": "from_step1"},
        --   "step2": {"output": "from_step2"}
        -- }
        --
        -- Build object with 'run' key containing original input
        jsonb_build_object('run', r.input) ||
        -- Merge with deps_output which already has dependency outputs
        -- deps_output format: {"dep1": output1, "dep2": output2, ...}
        -- If no dependencies, defaults to empty object
        coalesce(dep_out.deps_output, '{}'::jsonb)
    END as input,
    st.message_id as msg_id,
    st.task_index as task_index
  from tasks st
  join runs r on st.run_id = r.run_id
  join pgflow.steps step on
    step.flow_slug = st.flow_slug and
    step.step_slug = st.step_slug
  left join deps_outputs dep_out on
    dep_out.run_id = st.run_id and
    dep_out.step_slug = st.step_slug
$$;
-- Create "add_step" function
CREATE FUNCTION "pgflow"."add_step" ("flow_slug" text, "step_slug" text, "deps_slugs" text[] DEFAULT '{}', "max_attempts" integer DEFAULT NULL::integer, "base_delay" integer DEFAULT NULL::integer, "timeout" integer DEFAULT NULL::integer, "start_delay" integer DEFAULT NULL::integer, "step_type" text DEFAULT 'single') RETURNS "pgflow"."steps" LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  result_step pgflow.steps;
  next_idx int;
BEGIN
  -- Validate map step constraints
  -- Map steps can have either:
  --   0 dependencies (root map - maps over flow input array)
  --   1 dependency (dependent map - maps over dependency output array)
  IF COALESCE(add_step.step_type, 'single') = 'map' AND COALESCE(array_length(add_step.deps_slugs, 1), 0) > 1 THEN
    RAISE EXCEPTION 'Map step "%" can have at most one dependency, but % were provided: %', 
      add_step.step_slug,
      COALESCE(array_length(add_step.deps_slugs, 1), 0),
      array_to_string(add_step.deps_slugs, ', ');
  END IF;

  -- Get next step index
  SELECT COALESCE(MAX(s.step_index) + 1, 0) INTO next_idx
  FROM pgflow.steps s
  WHERE s.flow_slug = add_step.flow_slug;

  -- Create the step
  INSERT INTO pgflow.steps (
    flow_slug, step_slug, step_type, step_index, deps_count,
    opt_max_attempts, opt_base_delay, opt_timeout, opt_start_delay
  )
  VALUES (
    add_step.flow_slug,
    add_step.step_slug,
    COALESCE(add_step.step_type, 'single'),
    next_idx, 
    COALESCE(array_length(add_step.deps_slugs, 1), 0),
    add_step.max_attempts,
    add_step.base_delay,
    add_step.timeout,
    add_step.start_delay
  )
  ON CONFLICT ON CONSTRAINT steps_pkey
  DO UPDATE SET step_slug = EXCLUDED.step_slug
  RETURNING * INTO result_step;

  -- Insert dependencies
  INSERT INTO pgflow.deps (flow_slug, dep_slug, step_slug)
  SELECT add_step.flow_slug, d.dep_slug, add_step.step_slug
  FROM unnest(COALESCE(add_step.deps_slugs, '{}')) AS d(dep_slug)
  WHERE add_step.deps_slugs IS NOT NULL AND array_length(add_step.deps_slugs, 1) > 0
  ON CONFLICT ON CONSTRAINT deps_pkey DO NOTHING;
  
  RETURN result_step;
END;
$$;
-- Drop "add_step" function
DROP FUNCTION "pgflow"."add_step" (text, text, integer, integer, integer, integer);
-- Drop "add_step" function
DROP FUNCTION "pgflow"."add_step" (text, text, text[], integer, integer, integer, integer);
