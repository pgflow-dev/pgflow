-- Create "_cascade_force_skip_steps" function
CREATE FUNCTION "pgflow"."_cascade_force_skip_steps" ("run_id" uuid, "step_slug" text, "skip_reason" text) RETURNS integer LANGUAGE plpgsql AS $$
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
  -- ---------- Update run counters ----------
  run_updates AS (
    UPDATE pgflow.runs r
    SET remaining_steps = r.remaining_steps - skipped_count.count
    FROM (SELECT COUNT(*) AS count FROM skipped) skipped_count
    WHERE r.run_id = _cascade_force_skip_steps.run_id
      AND skipped_count.count > 0
  )
  SELECT COUNT(*) INTO v_total_skipped FROM skipped;

  RETURN v_total_skipped;
END;
$$;
-- Modify "cascade_resolve_conditions" function
CREATE OR REPLACE FUNCTION "pgflow"."cascade_resolve_conditions" ("run_id" uuid) RETURNS boolean LANGUAGE plpgsql SET "search_path" = '' AS $$
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
    WITH steps_with_conditions AS (
      SELECT
        step_state.flow_slug,
        step_state.step_slug,
        step.condition_pattern,
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
        AND step.condition_pattern IS NOT NULL
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
        CASE
          WHEN swc.deps_count = 0 THEN v_run_input @> swc.condition_pattern
          ELSE COALESCE(sdo.deps_output, '{}'::jsonb) @> swc.condition_pattern
        END AS condition_met
      FROM steps_with_conditions swc
      LEFT JOIN step_deps_output sdo ON sdo.step_slug = swc.step_slug
    )
    SELECT flow_slug, step_slug, condition_pattern
    INTO v_first_fail
    FROM condition_evaluations
    WHERE NOT condition_met AND when_unmet = 'fail'
    ORDER BY step_index
    LIMIT 1;

    -- Handle fail mode: fail step and run, return false
    IF v_first_fail IS NOT NULL THEN
      UPDATE pgflow.step_states
      SET status = 'failed',
          failed_at = now(),
          error_message = 'Condition not met: ' || v_first_fail.condition_pattern::text
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
    -- NEW: Also decrement remaining_deps on dependents and set initial_tasks=0 for map dependents.
    WITH steps_with_conditions AS (
      SELECT
        step_state.flow_slug,
        step_state.step_slug,
        step.condition_pattern,
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
        AND step.condition_pattern IS NOT NULL
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
        CASE
          WHEN swc.deps_count = 0 THEN v_run_input @> swc.condition_pattern
          ELSE COALESCE(sdo.deps_output, '{}'::jsonb) @> swc.condition_pattern
        END AS condition_met
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
      AND step.condition_pattern IS NOT NULL
      AND step.when_unmet = 'skip-cascade'
      AND NOT (
        CASE
          WHEN step.deps_count = 0 THEN v_run_input @> step.condition_pattern
          ELSE COALESCE(agg_deps.deps_output, '{}'::jsonb) @> step.condition_pattern
        END
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
-- Drop "cascade_skip_steps" function
DROP FUNCTION "pgflow"."cascade_skip_steps";
