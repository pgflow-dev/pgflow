-- Modify "step_states" table
ALTER TABLE "pgflow"."step_states" DROP CONSTRAINT "completed_at_or_failed_at", DROP CONSTRAINT "remaining_tasks_state_consistency", ADD CONSTRAINT "remaining_tasks_state_consistency" CHECK ((remaining_tasks IS NULL) OR (status <> ALL (ARRAY['created'::text, 'skipped'::text]))), DROP CONSTRAINT "status_is_valid", ADD CONSTRAINT "status_is_valid" CHECK (status = ANY (ARRAY['created'::text, 'started'::text, 'completed'::text, 'failed'::text, 'skipped'::text])), ADD CONSTRAINT "completed_at_or_failed_at_or_skipped_at" CHECK (((
CASE
    WHEN (completed_at IS NOT NULL) THEN 1
    ELSE 0
END +
CASE
    WHEN (failed_at IS NOT NULL) THEN 1
    ELSE 0
END) +
CASE
    WHEN (skipped_at IS NOT NULL) THEN 1
    ELSE 0
END) <= 1), ADD CONSTRAINT "skip_reason_matches_status" CHECK (((status = 'skipped'::text) AND (skip_reason IS NOT NULL)) OR ((status <> 'skipped'::text) AND (skip_reason IS NULL))), ADD CONSTRAINT "skipped_at_is_after_created_at" CHECK ((skipped_at IS NULL) OR (skipped_at >= created_at)), ADD COLUMN "skip_reason" text NULL, ADD COLUMN "skipped_at" timestamptz NULL;
-- Create index "idx_step_states_skipped" to table: "step_states"
CREATE INDEX "idx_step_states_skipped" ON "pgflow"."step_states" ("run_id", "step_slug") WHERE (status = 'skipped'::text);
-- Modify "steps" table
ALTER TABLE "pgflow"."steps" ADD CONSTRAINT "when_failed_is_valid" CHECK (when_failed = ANY (ARRAY['fail'::text, 'skip'::text, 'skip-cascade'::text])), ADD CONSTRAINT "when_unmet_is_valid" CHECK (when_unmet = ANY (ARRAY['fail'::text, 'skip'::text, 'skip-cascade'::text])), ADD COLUMN "condition_pattern" jsonb NULL, ADD COLUMN "when_unmet" text NOT NULL DEFAULT 'skip', ADD COLUMN "when_failed" text NOT NULL DEFAULT 'fail';
-- Create "add_step" function
CREATE FUNCTION "pgflow"."add_step" ("flow_slug" text, "step_slug" text, "deps_slugs" text[] DEFAULT '{}', "max_attempts" integer DEFAULT NULL::integer, "base_delay" integer DEFAULT NULL::integer, "timeout" integer DEFAULT NULL::integer, "start_delay" integer DEFAULT NULL::integer, "step_type" text DEFAULT 'single', "condition_pattern" jsonb DEFAULT NULL::jsonb, "when_unmet" text DEFAULT 'skip', "when_failed" text DEFAULT 'fail') RETURNS "pgflow"."steps" LANGUAGE plpgsql SET "search_path" = '' AS $$
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
    opt_max_attempts, opt_base_delay, opt_timeout, opt_start_delay,
    condition_pattern, when_unmet, when_failed
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
    add_step.start_delay,
    add_step.condition_pattern,
    add_step.when_unmet,
    add_step.when_failed
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
-- Create "cascade_skip_steps" function
CREATE FUNCTION "pgflow"."cascade_skip_steps" ("run_id" uuid, "step_slug" text, "skip_reason" text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_flow_slug text;
  v_total_skipped int := 0;
BEGIN
  -- Get flow_slug for this run
  SELECT r.flow_slug INTO v_flow_slug
  FROM pgflow.runs r
  WHERE r.run_id = cascade_skip_steps.run_id;

  IF v_flow_slug IS NULL THEN
    RAISE EXCEPTION 'Run not found: %', cascade_skip_steps.run_id;
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
      cascade_skip_steps.skip_reason AS reason  -- Original reason for trigger step
    FROM pgflow.steps s
    WHERE s.flow_slug = v_flow_slug
      AND s.step_slug = cascade_skip_steps.step_slug

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
    WHERE ss.run_id = cascade_skip_steps.run_id
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
    WHERE r.run_id = cascade_skip_steps.run_id
      AND skipped_count.count > 0
  )
  SELECT COUNT(*) INTO v_total_skipped FROM skipped;

  RETURN v_total_skipped;
END;
$$;
-- Drop "add_step" function
DROP FUNCTION "pgflow"."add_step" (text, text, text[], integer, integer, integer, integer, text);
