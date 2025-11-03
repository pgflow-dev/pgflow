create or replace function pgflow.cascade_complete_taskless_steps(run_id uuid)
returns int
language plpgsql
as $$
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
    WITH
    -- ---------- Find steps to complete in topological order ----------
    steps_to_complete AS (
      SELECT ss.run_id, ss.step_slug
      FROM pgflow.step_states ss
      JOIN pgflow.steps s ON s.flow_slug = ss.flow_slug AND s.step_slug = ss.step_slug
      WHERE ss.run_id = cascade_complete_taskless_steps.run_id
        AND ss.status = 'created'
        AND ss.remaining_deps = 0
        AND ss.initial_tasks = 0
      -- Process in topological order to ensure proper cascade
      ORDER BY s.step_index
    ),
    completed AS (
      -- ---------- Complete taskless steps ----------
      -- Steps with initial_tasks=0 and no remaining deps
      UPDATE pgflow.step_states ss
      SET status = 'completed',
          started_at = now(),
          completed_at = now(),
          remaining_tasks = 0
      FROM steps_to_complete stc
      WHERE ss.run_id = stc.run_id
        AND ss.step_slug = stc.step_slug
      RETURNING
        ss.*,
        -- Broadcast step:completed event atomically with the UPDATE
        -- Using RETURNING ensures this executes during row processing
        -- and cannot be optimized away by the query planner
        realtime.send(
          jsonb_build_object(
            'event_type', 'step:completed',
            'run_id', ss.run_id,
            'step_slug', ss.step_slug,
            'status', 'completed',
            'started_at', ss.started_at,
            'completed_at', ss.completed_at,
            'remaining_tasks', 0,
            'remaining_deps', 0,
            'output', '[]'::jsonb
          ),
          concat('step:', ss.step_slug, ':completed'),
          concat('pgflow:run:', ss.run_id),
          false
        ) as _broadcast_result  -- Prefix with _ to indicate internal use only
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
