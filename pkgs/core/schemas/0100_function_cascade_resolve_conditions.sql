-- cascade_resolve_conditions: Evaluate step conditions and handle skip/fail modes
-- Called before cascade_complete_taskless_steps to evaluate conditions on ready steps.
-- Must iterate until convergence since skipping a step can make dependents ready.
--
-- Returns:
--   true  = run can continue (or nothing to do)
--   false = run was failed (due to fail mode)
create or replace function pgflow.cascade_resolve_conditions(run_id uuid)
returns boolean
language plpgsql
set search_path to ''
as $$
DECLARE
  v_run_input jsonb;
  v_run_status text;
  v_first_fail record;
  v_iteration_count int := 0;
  v_max_iterations int := 50;
  v_processed_count int;
BEGIN
  -- ==========================================
  -- GUARD: Early return if run is already terminal
  -- ==========================================
  SELECT r.status, r.input INTO v_run_status, v_run_input
  FROM pgflow.runs r
  WHERE r.run_id = cascade_resolve_conditions.run_id;

  IF v_run_status IN ('failed', 'completed') THEN
    RETURN v_run_status != 'failed';
  END IF;

  -- ==========================================
  -- ITERATE UNTIL CONVERGENCE
  -- ==========================================
  -- After skipping steps, dependents may become ready and need evaluation.
  -- Loop until no more steps are processed.
  LOOP
    v_iteration_count := v_iteration_count + 1;
    IF v_iteration_count > v_max_iterations THEN
      RAISE EXCEPTION 'cascade_resolve_conditions exceeded safety limit of % iterations', v_max_iterations;
    END IF;

    v_processed_count := 0;

    -- ==========================================
    -- PHASE 1a: CHECK FOR FAIL CONDITIONS
    -- ==========================================
    -- Find first step (by topological order) with unmet condition and 'fail' mode.
    -- Condition is unmet when:
    --   (condition_pattern is set AND input does NOT contain it) OR
    --   (condition_not_pattern is set AND input DOES contain it)
    WITH steps_with_conditions AS (
      SELECT
        step_state.flow_slug,
        step_state.step_slug,
        step.condition_pattern,
        step.condition_not_pattern,
        step.when_unmet,
        step.deps_count,
        step.step_index
      FROM pgflow.step_states AS step_state
      JOIN pgflow.steps AS step
        ON step.flow_slug = step_state.flow_slug
        AND step.step_slug = step_state.step_slug
      WHERE step_state.run_id = cascade_resolve_conditions.run_id
        AND step_state.status = 'created'
        AND step_state.remaining_deps = 0
        AND (step.condition_pattern IS NOT NULL OR step.condition_not_pattern IS NOT NULL)
    ),
    step_deps_output AS (
      SELECT
        swc.step_slug,
        jsonb_object_agg(dep_state.step_slug, dep_state.output) AS deps_output
      FROM steps_with_conditions swc
      JOIN pgflow.deps dep ON dep.flow_slug = swc.flow_slug AND dep.step_slug = swc.step_slug
      JOIN pgflow.step_states dep_state
        ON dep_state.run_id = cascade_resolve_conditions.run_id
        AND dep_state.step_slug = dep.dep_slug
        AND dep_state.status = 'completed'  -- Only completed deps (not skipped)
      WHERE swc.deps_count > 0
      GROUP BY swc.step_slug
    ),
    condition_evaluations AS (
      SELECT
        swc.*,
        -- condition_met = (if IS NULL OR input @> if) AND (ifNot IS NULL OR NOT(input @> ifNot))
        (swc.condition_pattern IS NULL OR
          CASE WHEN swc.deps_count = 0 THEN v_run_input ELSE COALESCE(sdo.deps_output, '{}'::jsonb) END @> swc.condition_pattern)
        AND
        (swc.condition_not_pattern IS NULL OR
          NOT (CASE WHEN swc.deps_count = 0 THEN v_run_input ELSE COALESCE(sdo.deps_output, '{}'::jsonb) END @> swc.condition_not_pattern))
        AS condition_met
      FROM steps_with_conditions swc
      LEFT JOIN step_deps_output sdo ON sdo.step_slug = swc.step_slug
    )
    SELECT flow_slug, step_slug, condition_pattern, condition_not_pattern
    INTO v_first_fail
    FROM condition_evaluations
    WHERE NOT condition_met AND when_unmet = 'fail'
    ORDER BY step_index
    LIMIT 1;

    -- Handle fail mode: fail step and run, return false
    -- Note: Cannot use "v_first_fail IS NOT NULL" because records with NULL fields
    -- evaluate to NULL in IS NOT NULL checks. Use FOUND instead.
    IF FOUND THEN
      UPDATE pgflow.step_states
      SET status = 'failed',
          failed_at = now(),
          error_message = 'Condition not met'
      WHERE pgflow.step_states.run_id = cascade_resolve_conditions.run_id
        AND pgflow.step_states.step_slug = v_first_fail.step_slug;

      UPDATE pgflow.runs
      SET status = 'failed',
          failed_at = now()
      WHERE pgflow.runs.run_id = cascade_resolve_conditions.run_id;

      RETURN false;
    END IF;

    -- ==========================================
    -- PHASE 1b: HANDLE SKIP CONDITIONS (with propagation)
    -- ==========================================
    -- Skip steps with unmet conditions and whenUnmet='skip'.
    -- Also decrement remaining_deps on dependents and set initial_tasks=0 for map dependents.
    WITH steps_with_conditions AS (
      SELECT
        step_state.flow_slug,
        step_state.step_slug,
        step.condition_pattern,
        step.condition_not_pattern,
        step.when_unmet,
        step.deps_count,
        step.step_index
      FROM pgflow.step_states AS step_state
      JOIN pgflow.steps AS step
        ON step.flow_slug = step_state.flow_slug
        AND step.step_slug = step_state.step_slug
      WHERE step_state.run_id = cascade_resolve_conditions.run_id
        AND step_state.status = 'created'
        AND step_state.remaining_deps = 0
        AND (step.condition_pattern IS NOT NULL OR step.condition_not_pattern IS NOT NULL)
    ),
    step_deps_output AS (
      SELECT
        swc.step_slug,
        jsonb_object_agg(dep_state.step_slug, dep_state.output) AS deps_output
      FROM steps_with_conditions swc
      JOIN pgflow.deps dep ON dep.flow_slug = swc.flow_slug AND dep.step_slug = swc.step_slug
      JOIN pgflow.step_states dep_state
        ON dep_state.run_id = cascade_resolve_conditions.run_id
        AND dep_state.step_slug = dep.dep_slug
        AND dep_state.status = 'completed'  -- Only completed deps (not skipped)
      WHERE swc.deps_count > 0
      GROUP BY swc.step_slug
    ),
    condition_evaluations AS (
      SELECT
        swc.*,
        -- condition_met = (if IS NULL OR input @> if) AND (ifNot IS NULL OR NOT(input @> ifNot))
        (swc.condition_pattern IS NULL OR
          CASE WHEN swc.deps_count = 0 THEN v_run_input ELSE COALESCE(sdo.deps_output, '{}'::jsonb) END @> swc.condition_pattern)
        AND
        (swc.condition_not_pattern IS NULL OR
          NOT (CASE WHEN swc.deps_count = 0 THEN v_run_input ELSE COALESCE(sdo.deps_output, '{}'::jsonb) END @> swc.condition_not_pattern))
        AS condition_met
      FROM steps_with_conditions swc
      LEFT JOIN step_deps_output sdo ON sdo.step_slug = swc.step_slug
    ),
    unmet_skip_steps AS (
      SELECT * FROM condition_evaluations
      WHERE NOT condition_met AND when_unmet = 'skip'
    ),
    skipped_steps AS (
      UPDATE pgflow.step_states ss
      SET status = 'skipped',
          skip_reason = 'condition_unmet',
          skipped_at = now()
      FROM unmet_skip_steps uss
      WHERE ss.run_id = cascade_resolve_conditions.run_id
        AND ss.step_slug = uss.step_slug
      RETURNING
        ss.*,
        realtime.send(
          jsonb_build_object(
            'event_type', 'step:skipped',
            'run_id', ss.run_id,
            'flow_slug', ss.flow_slug,
            'step_slug', ss.step_slug,
            'status', 'skipped',
            'skip_reason', 'condition_unmet',
            'skipped_at', ss.skipped_at
          ),
          concat('step:', ss.step_slug, ':skipped'),
          concat('pgflow:run:', ss.run_id),
          false
        ) AS _broadcast_result
    ),
    -- NEW: Update dependent steps (decrement remaining_deps, set initial_tasks=0 for maps)
    dependent_updates AS (
      UPDATE pgflow.step_states child_state
      SET remaining_deps = child_state.remaining_deps - 1,
          -- If child is a map step and this skipped step is its only dependency,
          -- set initial_tasks = 0 (skipped dep = empty array)
          initial_tasks = CASE
            WHEN child_step.step_type = 'map' AND child_step.deps_count = 1 THEN 0
            ELSE child_state.initial_tasks
          END
      FROM skipped_steps parent
      JOIN pgflow.deps dep ON dep.flow_slug = parent.flow_slug AND dep.dep_slug = parent.step_slug
      JOIN pgflow.steps child_step ON child_step.flow_slug = dep.flow_slug AND child_step.step_slug = dep.step_slug
      WHERE child_state.run_id = cascade_resolve_conditions.run_id
        AND child_state.step_slug = dep.step_slug
    ),
    run_update AS (
      UPDATE pgflow.runs r
      SET remaining_steps = r.remaining_steps - (SELECT COUNT(*) FROM skipped_steps)
      WHERE r.run_id = cascade_resolve_conditions.run_id
        AND (SELECT COUNT(*) FROM skipped_steps) > 0
    )
    SELECT COUNT(*)::int INTO v_processed_count FROM skipped_steps;

    -- ==========================================
    -- PHASE 1c: HANDLE SKIP-CASCADE CONDITIONS
    -- ==========================================
    -- Call _cascade_force_skip_steps for each step with unmet condition and whenUnmet='skip-cascade'.
    -- Process in topological order; _cascade_force_skip_steps is idempotent.
    PERFORM pgflow._cascade_force_skip_steps(cascade_resolve_conditions.run_id, ready_step.step_slug, 'condition_unmet')
    FROM pgflow.step_states AS ready_step
    JOIN pgflow.steps AS step
      ON step.flow_slug = ready_step.flow_slug
      AND step.step_slug = ready_step.step_slug
    LEFT JOIN LATERAL (
      SELECT jsonb_object_agg(dep_state.step_slug, dep_state.output) AS deps_output
      FROM pgflow.deps dep
      JOIN pgflow.step_states dep_state
        ON dep_state.run_id = cascade_resolve_conditions.run_id
        AND dep_state.step_slug = dep.dep_slug
        AND dep_state.status = 'completed'  -- Only completed deps (not skipped)
      WHERE dep.flow_slug = ready_step.flow_slug
        AND dep.step_slug = ready_step.step_slug
    ) AS agg_deps ON step.deps_count > 0
    WHERE ready_step.run_id = cascade_resolve_conditions.run_id
      AND ready_step.status = 'created'
      AND ready_step.remaining_deps = 0
      AND (step.condition_pattern IS NOT NULL OR step.condition_not_pattern IS NOT NULL)
      AND step.when_unmet = 'skip-cascade'
      -- Condition is NOT met when: (if fails) OR (ifNot fails)
      AND NOT (
        (step.condition_pattern IS NULL OR
          CASE WHEN step.deps_count = 0 THEN v_run_input ELSE COALESCE(agg_deps.deps_output, '{}'::jsonb) END @> step.condition_pattern)
        AND
        (step.condition_not_pattern IS NULL OR
          NOT (CASE WHEN step.deps_count = 0 THEN v_run_input ELSE COALESCE(agg_deps.deps_output, '{}'::jsonb) END @> step.condition_not_pattern))
      )
    ORDER BY step.step_index;

    -- Check if run was failed during cascade (e.g., if _cascade_force_skip_steps triggers fail)
    SELECT r.status INTO v_run_status
    FROM pgflow.runs r
    WHERE r.run_id = cascade_resolve_conditions.run_id;

    IF v_run_status IN ('failed', 'completed') THEN
      RETURN v_run_status != 'failed';
    END IF;

    -- Exit loop if no steps were processed in this iteration
    EXIT WHEN v_processed_count = 0;
  END LOOP;

  RETURN true;
END;
$$;
