-- Modify "step_tasks" table
ALTER TABLE "pgflow"."step_tasks" DROP CONSTRAINT "valid_status", ADD CONSTRAINT "valid_status" CHECK (status = ANY (ARRAY['queued'::text, 'started'::text, 'completed'::text, 'failed'::text, 'skipped'::text]));
-- Modify "_cascade_force_skip_steps" function
CREATE OR REPLACE FUNCTION "pgflow"."_cascade_force_skip_steps" ("run_id" uuid, "step_slug" text, "skip_reason" text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_flow_slug text;
  v_total_skipped int := 0;
BEGIN
  -- Get flow_slug for this run
  SELECT r.flow_slug INTO v_flow_slug
  FROM pgflow.runs r
  WHERE r.run_id = _cascade_force_skip_steps.run_id;

  IF v_flow_slug IS NULL THEN
    RAISE EXCEPTION 'Run not found: %', _cascade_force_skip_steps.run_id;
  END IF;

  -- ==========================================
  -- SKIP STEPS IN TOPOLOGICAL ORDER
  -- ==========================================
  -- Use recursive CTE to find all downstream dependents,
  -- then skip them in topological order (by step_index)
  WITH RECURSIVE
  -- ---------- Find all downstream steps ----------
  downstream_steps AS (
    -- Base case: the trigger step
    SELECT
      s.flow_slug,
      s.step_slug,
      s.step_index,
      _cascade_force_skip_steps.skip_reason AS reason  -- Original reason for trigger step
    FROM pgflow.steps s
    WHERE s.flow_slug = v_flow_slug
      AND s.step_slug = _cascade_force_skip_steps.step_slug

    UNION ALL

    -- Recursive case: steps that depend on already-found steps
    SELECT
      s.flow_slug,
      s.step_slug,
      s.step_index,
      'dependency_skipped'::text AS reason  -- Downstream steps get this reason
    FROM pgflow.steps s
    JOIN pgflow.deps d ON d.flow_slug = s.flow_slug AND d.step_slug = s.step_slug
    JOIN downstream_steps ds ON ds.flow_slug = d.flow_slug AND ds.step_slug = d.dep_slug
  ),
  -- ---------- Deduplicate and order by step_index ----------
  steps_to_skip AS (
    SELECT DISTINCT ON (ds.step_slug)
      ds.flow_slug,
      ds.step_slug,
      ds.step_index,
      ds.reason
    FROM downstream_steps ds
    ORDER BY ds.step_slug, ds.step_index  -- Keep first occurrence (trigger step has original reason)
  ),
  -- ---------- Skip the steps ----------
  skipped AS (
    UPDATE pgflow.step_states ss
    SET status = 'skipped',
        skip_reason = sts.reason,
        skipped_at = now(),
        remaining_tasks = NULL  -- Clear remaining_tasks for skipped steps
    FROM steps_to_skip sts
    WHERE ss.run_id = _cascade_force_skip_steps.run_id
      AND ss.step_slug = sts.step_slug
      AND ss.status IN ('created', 'started')  -- Only skip non-terminal steps
    RETURNING
      ss.*,
      -- Broadcast step:skipped event
      realtime.send(
        jsonb_build_object(
          'event_type', 'step:skipped',
          'run_id', ss.run_id,
          'flow_slug', ss.flow_slug,
          'step_slug', ss.step_slug,
          'status', 'skipped',
          'skip_reason', ss.skip_reason,
          'skipped_at', ss.skipped_at
        ),
        concat('step:', ss.step_slug, ':skipped'),
        concat('pgflow:run:', ss.run_id),
        false
      ) as _broadcast_result
  ),
  -- ---------- Terminalize active tasks of newly skipped steps ----------
  skipped_tasks AS (
    UPDATE pgflow.step_tasks AS task
    SET status = 'skipped'
    WHERE task.run_id = _cascade_force_skip_steps.run_id
      AND task.step_slug IN (
        SELECT skipped_step.step_slug
        FROM skipped AS skipped_step
      )
      AND task.status IN ('queued', 'started')
    RETURNING task.message_id
  ),
  -- ---------- Archive queued/started task messages for skipped steps ----------
  archived_messages AS (
    SELECT pgmq.archive(v_flow_slug, ARRAY_AGG(task.message_id)) as result
    FROM skipped_tasks AS task
    WHERE task.message_id IS NOT NULL
    HAVING COUNT(task.message_id) > 0
  ),
  -- ---------- Update run counters ----------
  run_updates AS (
    UPDATE pgflow.runs r
    SET remaining_steps = r.remaining_steps - skipped_count.count
    FROM (SELECT COUNT(*) AS count FROM skipped) skipped_count
    WHERE r.run_id = _cascade_force_skip_steps.run_id
      AND skipped_count.count > 0
  )
  SELECT skipped_count.count
  INTO v_total_skipped
  FROM (SELECT COUNT(*) AS count FROM skipped) skipped_count
  LEFT JOIN archived_messages ON true;

  RETURN v_total_skipped;
END;
$$;
-- Modify "fail_task" function
CREATE OR REPLACE FUNCTION "pgflow"."fail_task" ("run_id" uuid, "step_slug" text, "task_index" integer, "error_message" text) RETURNS SETOF "pgflow"."step_tasks" LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  v_run_failed boolean;
  v_step_failed boolean;
  v_step_skipped boolean;
  v_when_exhausted text;
  v_task_exhausted boolean;
  v_flow_slug_for_deps text;
  v_prev_step_status text;
  v_flow_slug text;
  v_skipped_message_ids bigint[];
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

-- Late callback guard: lock run + step rows and use current step status
-- under lock so concurrent fail_task calls cannot read stale status.
SELECT ss.status, r.flow_slug INTO v_prev_step_status, v_flow_slug
FROM pgflow.runs r
JOIN pgflow.step_states ss ON ss.run_id = r.run_id
WHERE ss.run_id = fail_task.run_id
  AND ss.step_slug = fail_task.step_slug
FOR UPDATE OF r, ss;

IF v_prev_step_status IS NOT NULL AND v_prev_step_status != 'started' THEN
  -- Archive the task message if present
  PERFORM pgmq.archive(v_flow_slug, ARRAY_AGG(st.message_id))
  FROM pgflow.step_tasks st
  WHERE st.run_id = fail_task.run_id
    AND st.step_slug = fail_task.step_slug
    AND st.task_index = fail_task.task_index
    AND st.message_id IS NOT NULL
  HAVING COUNT(st.message_id) > 0;

  RETURN QUERY SELECT * FROM pgflow.step_tasks
  WHERE pgflow.step_tasks.run_id = fail_task.run_id
    AND pgflow.step_tasks.step_slug = fail_task.step_slug
    AND pgflow.step_tasks.task_index = fail_task.task_index;
  RETURN;
END IF;

WITH flow_info AS (
  SELECT r.flow_slug
  FROM pgflow.runs r
  WHERE r.run_id = fail_task.run_id
),
  config AS (
  SELECT
    COALESCE(s.opt_max_attempts, f.opt_max_attempts) AS opt_max_attempts,
    COALESCE(s.opt_base_delay, f.opt_base_delay) AS opt_base_delay,
    s.when_exhausted
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
 -- Determine if task exhausted retries and get when_exhausted mode
 task_status AS (
   SELECT
     (select status from fail_or_retry_task) AS new_task_status,
     (select when_exhausted from config) AS when_exhausted_mode,
    -- Task is exhausted when it's failed (no more retries)
    ((select status from fail_or_retry_task) = 'failed') AS is_exhausted
),
maybe_fail_step AS (
  UPDATE pgflow.step_states
  SET
     -- Status logic:
     -- - If task not exhausted (retrying): keep current status
     -- - If exhausted AND when_exhausted='fail': set to 'failed'
     -- - If exhausted AND when_exhausted IN ('skip', 'skip-cascade'): set to 'skipped'
     status = CASE
              WHEN NOT (select is_exhausted from task_status) THEN pgflow.step_states.status
              WHEN (select when_exhausted_mode from task_status) = 'fail' THEN 'failed'
              ELSE 'skipped'  -- skip or skip-cascade
              END,
    failed_at = CASE
                 WHEN (select is_exhausted from task_status) AND (select when_exhausted_mode from task_status) = 'fail' THEN now()
                 ELSE NULL
                 END,
    error_message = CASE
                    WHEN (select is_exhausted from task_status) THEN fail_task.error_message
                    ELSE NULL
                    END,
    skip_reason = CASE
                  WHEN (select is_exhausted from task_status) AND (select when_exhausted_mode from task_status) IN ('skip', 'skip-cascade') THEN 'handler_failed'
                  ELSE pgflow.step_states.skip_reason
                  END,
    skipped_at = CASE
                 WHEN (select is_exhausted from task_status) AND (select when_exhausted_mode from task_status) IN ('skip', 'skip-cascade') THEN now()
                 ELSE pgflow.step_states.skipped_at
                 END,
    -- Clear remaining_tasks when skipping (required by remaining_tasks_state_consistency constraint)
    remaining_tasks = CASE
                      WHEN (select is_exhausted from task_status) AND (select when_exhausted_mode from task_status) IN ('skip', 'skip-cascade') THEN NULL
                      ELSE pgflow.step_states.remaining_tasks
                      END
  FROM fail_or_retry_task
  WHERE pgflow.step_states.run_id = fail_task.run_id
    AND pgflow.step_states.step_slug = fail_task.step_slug
  RETURNING pgflow.step_states.*
),
run_update AS (
  -- Update run status: only fail when when_exhausted='fail' and step was failed
  UPDATE pgflow.runs
  SET status = CASE
               WHEN (select status from maybe_fail_step) = 'failed' THEN 'failed'
               ELSE status
               END,
      failed_at = CASE
                  WHEN (select status from maybe_fail_step) = 'failed' THEN now()
                  ELSE NULL
                  END,
      -- Decrement remaining_steps only on FIRST transition to skipped
      -- (not when step was already skipped and a second task fails)
      -- Uses PL/pgSQL variable captured before CTE chain
      remaining_steps = CASE
                        WHEN (select status from maybe_fail_step) = 'skipped'
                             AND v_prev_step_status != 'skipped'
                        THEN pgflow.runs.remaining_steps - 1
                        ELSE pgflow.runs.remaining_steps
                        END
  WHERE pgflow.runs.run_id = fail_task.run_id
  RETURNING pgflow.runs.status
)
SELECT
  COALESCE((SELECT status = 'failed' FROM run_update), false),
  COALESCE((SELECT status = 'failed' FROM maybe_fail_step), false),
  COALESCE((SELECT status = 'skipped' FROM maybe_fail_step), false),
  COALESCE((SELECT is_exhausted FROM task_status), false)
INTO v_run_failed, v_step_failed, v_step_skipped, v_task_exhausted;

 -- Capture when_exhausted mode for later skip handling
 SELECT s.when_exhausted INTO v_when_exhausted
 FROM pgflow.steps s
JOIN pgflow.runs r ON r.flow_slug = s.flow_slug
 WHERE r.run_id = fail_task.run_id
   AND s.step_slug = fail_task.step_slug;

-- Send broadcast event for step failure if the step was failed
IF v_task_exhausted AND v_step_failed THEN
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

-- Handle step skipping (when_exhausted = 'skip' or 'skip-cascade')
 IF v_task_exhausted AND v_step_skipped THEN
  -- Lock-order invariant: always lock/update step_tasks before PGMQ queue rows.
  -- requeue_stalled_tasks() uses the same order; archiving queue rows first
  -- deadlocks the two transactions against each other.
  -- Terminalize all still-active sibling task rows for the skipped step,
  -- capturing their message ids for archival below.
  WITH skipped_tasks AS (
    UPDATE pgflow.step_tasks AS task
    SET status = 'skipped'
    WHERE task.run_id = fail_task.run_id
      AND task.step_slug = fail_task.step_slug
      AND task.status IN ('queued', 'started')
    RETURNING task.message_id
  )
  SELECT ARRAY_AGG(st.message_id) INTO v_skipped_message_ids
  FROM skipped_tasks st
  WHERE st.message_id IS NOT NULL;

  -- Archive the sibling task messages captured above (only after their task rows are terminalized)
  IF v_skipped_message_ids IS NOT NULL THEN
    PERFORM pgmq.archive(v_flow_slug, v_skipped_message_ids);
  END IF;

  -- Send broadcast event for step skipped
  PERFORM realtime.send(
    jsonb_build_object(
      'event_type', 'step:skipped',
      'run_id', fail_task.run_id,
      'step_slug', fail_task.step_slug,
      'status', 'skipped',
      'skip_reason', 'handler_failed',
      'error_message', fail_task.error_message,
      'skipped_at', now()
    ),
    concat('step:', fail_task.step_slug, ':skipped'),
    concat('pgflow:run:', fail_task.run_id),
    false
  );

   -- For skip-cascade: cascade skip to all downstream dependents
   IF v_when_exhausted = 'skip-cascade' THEN
    PERFORM pgflow._cascade_force_skip_steps(fail_task.run_id, fail_task.step_slug, 'handler_failed');
  ELSE
    -- For plain 'skip': decrement remaining_deps on dependent steps
    -- (This mirrors the pattern in cascade_resolve_conditions.sql for when_unmet='skip')
    SELECT flow_slug INTO v_flow_slug_for_deps
    FROM pgflow.runs
    WHERE pgflow.runs.run_id = fail_task.run_id;

    UPDATE pgflow.step_states AS child_state
    SET remaining_deps = child_state.remaining_deps - 1,
        -- If child is a map step and this skipped step is its only dependency,
        -- set initial_tasks = 0 (skipped dep = empty array)
        initial_tasks = CASE
          WHEN child_step.step_type = 'map' AND child_step.deps_count = 1 THEN 0
          ELSE child_state.initial_tasks
        END
    FROM pgflow.deps AS dep
    JOIN pgflow.steps AS child_step ON child_step.flow_slug = dep.flow_slug AND child_step.step_slug = dep.step_slug
    WHERE child_state.run_id = fail_task.run_id
      AND dep.flow_slug = v_flow_slug_for_deps
      AND dep.dep_slug = fail_task.step_slug
      AND child_state.step_slug = dep.step_slug;

    -- Evaluate conditions on newly-ready dependent steps
    -- This must happen before cascade_complete_taskless_steps so that
    -- skipped steps can set initial_tasks=0 for their map dependents
    IF NOT pgflow.cascade_resolve_conditions(fail_task.run_id) THEN
      -- Run was failed due to a condition with when_unmet='fail'
      -- Archive the failed task's message before returning
      PERFORM pgflow._archive_task_message(fail_task.run_id, fail_task.step_slug, fail_task.task_index);
      -- Return the task row (API contract)
      RETURN QUERY SELECT * FROM pgflow.step_tasks
      WHERE pgflow.step_tasks.run_id = fail_task.run_id
        AND pgflow.step_tasks.step_slug = fail_task.step_slug
        AND pgflow.step_tasks.task_index = fail_task.task_index;
      RETURN;
    END IF;

    -- Auto-complete taskless steps (e.g., map steps with initial_tasks=0 from skipped dep)
    PERFORM pgflow.cascade_complete_taskless_steps(fail_task.run_id);

    -- Start steps that became ready after condition resolution and taskless completion
    PERFORM pgflow.start_ready_steps(fail_task.run_id);
  END IF;

  -- Try to complete the run (remaining_steps may now be 0)
  PERFORM pgflow.maybe_complete_run(fail_task.run_id);
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
-- Modify "start_tasks" function
CREATE OR REPLACE FUNCTION "pgflow"."start_tasks" ("flow_slug" text, "msg_ids" bigint[], "worker_id" uuid) RETURNS SETOF "pgflow"."step_task_record" LANGUAGE sql SET "search_path" = '' AS $$
with task_candidates as (
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
      and r.status = 'started'
      and exists (
        select 1
        from pgflow.step_states ss
        where ss.run_id = task.run_id
          and ss.step_slug = task.step_slug
          and ss.status = 'started'
      )
  ),
  -- Claim rows with a guarded update and return only what was actually
  -- claimed. A concurrent skip can win the row lock between the candidate
  -- select and this update; the status = 'queued' recheck then claims nothing,
  -- so no stale candidate row must escape to the worker (#638).
  tasks as (
    update pgflow.step_tasks
    set
      attempts_count = attempts_count + 1,
      status = 'started',
      started_at = now(),
      last_worker_id = worker_id
    from task_candidates as candidate
    where step_tasks.message_id = candidate.message_id
      and step_tasks.flow_slug = candidate.flow_slug
      and step_tasks.status = 'queued'
    returning
      step_tasks.flow_slug,
      step_tasks.run_id,
      step_tasks.step_slug,
      step_tasks.task_index,
      step_tasks.message_id
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
      -- Read output directly from step_states (already aggregated by writers)
      dep_state.output as dep_output
    from tasks st
    join pgflow.deps dep on dep.flow_slug = st.flow_slug and dep.step_slug = st.step_slug
    join pgflow.step_states dep_state on
      dep_state.run_id = st.run_id and
      dep_state.step_slug = dep.dep_slug and
      dep_state.status = 'completed'  -- Only include completed deps (not skipped)
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
      -- Regular (non-map) steps receive dependency outputs as a structured object.
      -- Root steps (no dependencies) get empty object - they access flowInput via context.
      -- Dependent steps get only their dependency outputs.
      ELSE
        -- Non-map steps get structured input with dependency keys only
        -- Example for dependent step: {
        --   "step1": {"output": "from_step1"},
        --   "step2": {"output": "from_step2"}
        -- }
        -- Example for root step: {}
        --
        -- Note: flow_input is available separately in the returned record
        -- for workers to access via context.flowInput
        coalesce(dep_out.deps_output, '{}'::jsonb)
    END as input,
    st.message_id as msg_id,
    st.task_index as task_index,
    -- flow_input: Original run input for worker context
    -- Only included for root non-map steps to avoid data duplication.
    -- Root map steps: flowInput IS the array, useless to include
    -- Dependent steps: lazy load via ctx.flowInput when needed
    CASE
      WHEN step.step_type != 'map' AND step.deps_count = 0
      THEN r.input
      ELSE NULL
    END as flow_input
  from tasks st
  join runs r on st.run_id = r.run_id
  join pgflow.steps step on
    step.flow_slug = st.flow_slug and
    step.step_slug = st.step_slug
  left join deps_outputs dep_out on
    dep_out.run_id = st.run_id and
    dep_out.step_slug = st.step_slug
$$;

-- ==========================================
-- DATA REPAIR: Terminalize orphaned active tasks under skipped steps
-- ==========================================
-- Historical skip paths archived messages but left sibling task rows
-- queued/started. Repairs skipped steps whether the containing run is still
-- started or already completed; task rows on failed runs are out of scope (#645).
-- Does not re-archive messages: the historical skip paths already archived them.

UPDATE pgflow.step_tasks AS task
SET status = 'skipped'
FROM pgflow.step_states AS step
WHERE step.run_id = task.run_id
  AND step.step_slug = task.step_slug
  AND step.status = 'skipped'
  AND task.status IN ('queued', 'started');
