-- Modify "create_flow" function
CREATE OR REPLACE FUNCTION "pgflow"."create_flow" ("flow_slug" text, "max_attempts" integer DEFAULT NULL::integer, "base_delay" integer DEFAULT NULL::integer, "timeout" integer DEFAULT NULL::integer) RETURNS "pgflow"."flows" LANGUAGE sql SET "search_path" = '' AS $$
WITH
  defaults AS (
    SELECT 3 AS def_max_attempts, 5 AS def_base_delay, 60 AS def_timeout
  ),
  flow_upsert AS (
    INSERT INTO pgflow.flows (flow_slug, opt_max_attempts, opt_base_delay, opt_timeout)
    SELECT
      flow_slug,
      COALESCE(max_attempts, defaults.def_max_attempts),
      COALESCE(base_delay, defaults.def_base_delay),
      COALESCE(timeout, defaults.def_timeout)
    FROM defaults
    ON CONFLICT (flow_slug) DO UPDATE
    SET flow_slug = pgflow.flows.flow_slug -- Dummy update
    RETURNING *
  ),
  ensure_queue AS (
    SELECT pgmq.create(flow_slug)
    WHERE NOT EXISTS (
      SELECT 1 FROM pgmq.list_queues() WHERE queue_name = flow_slug
    )
  )
SELECT f.*
FROM flow_upsert f
LEFT JOIN (SELECT 1 FROM ensure_queue) _dummy ON true; -- Left join ensures flow is returned
$$;
-- Create "_compare_flow_shapes" function
CREATE FUNCTION "pgflow"."_compare_flow_shapes" ("p_local" jsonb, "p_db" jsonb) RETURNS text[] LANGUAGE plpgsql STABLE SET "search_path" = '' AS $BODY$
DECLARE
  v_differences text[] := '{}';
  v_local_steps jsonb;
  v_db_steps jsonb;
  v_local_count int;
  v_db_count int;
  v_max_count int;
  v_idx int;
  v_local_step jsonb;
  v_db_step jsonb;
  v_local_deps text;
  v_db_deps text;
BEGIN
  v_local_steps := p_local->'steps';
  v_db_steps := p_db->'steps';
  v_local_count := jsonb_array_length(COALESCE(v_local_steps, '[]'::jsonb));
  v_db_count := jsonb_array_length(COALESCE(v_db_steps, '[]'::jsonb));

  -- Compare step counts
  IF v_local_count != v_db_count THEN
    v_differences := array_append(
      v_differences,
      format('Step count differs: %s vs %s', v_local_count, v_db_count)
    );
  END IF;

  -- Compare steps by index
  v_max_count := GREATEST(v_local_count, v_db_count);

  FOR v_idx IN 0..(v_max_count - 1) LOOP
    v_local_step := v_local_steps->v_idx;
    v_db_step := v_db_steps->v_idx;

    IF v_local_step IS NULL THEN
      v_differences := array_append(
        v_differences,
        format(
          $$Step at index %s: missing in first shape (second has '%s')$$,
          v_idx,
          v_db_step->>'slug'
        )
      );
    ELSIF v_db_step IS NULL THEN
      v_differences := array_append(
        v_differences,
        format(
          $$Step at index %s: missing in second shape (first has '%s')$$,
          v_idx,
          v_local_step->>'slug'
        )
      );
    ELSE
      -- Compare slug
      IF v_local_step->>'slug' != v_db_step->>'slug' THEN
        v_differences := array_append(
          v_differences,
          format(
            $$Step at index %s: slug differs '%s' vs '%s'$$,
            v_idx,
            v_local_step->>'slug',
            v_db_step->>'slug'
          )
        );
      END IF;

      -- Compare step type
      IF v_local_step->>'stepType' != v_db_step->>'stepType' THEN
        v_differences := array_append(
          v_differences,
          format(
            $$Step at index %s: type differs '%s' vs '%s'$$,
            v_idx,
            v_local_step->>'stepType',
            v_db_step->>'stepType'
          )
        );
      END IF;

      -- Compare dependencies (convert arrays to comma-separated strings)
      SELECT string_agg(dep, ', ' ORDER BY dep)
      INTO v_local_deps
      FROM jsonb_array_elements_text(COALESCE(v_local_step->'dependencies', '[]'::jsonb)) AS dep;

      SELECT string_agg(dep, ', ' ORDER BY dep)
      INTO v_db_deps
      FROM jsonb_array_elements_text(COALESCE(v_db_step->'dependencies', '[]'::jsonb)) AS dep;

      IF COALESCE(v_local_deps, '') != COALESCE(v_db_deps, '') THEN
        v_differences := array_append(
          v_differences,
          format(
            $$Step at index %s: dependencies differ [%s] vs [%s]$$,
            v_idx,
            COALESCE(v_local_deps, ''),
            COALESCE(v_db_deps, '')
          )
        );
      END IF;
    END IF;
  END LOOP;

  RETURN v_differences;
END;
$BODY$;
-- Create "_create_flow_from_shape" function
CREATE FUNCTION "pgflow"."_create_flow_from_shape" ("p_flow_slug" text, "p_shape" jsonb) RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  v_step jsonb;
  v_deps text[];
  v_flow_options jsonb;
  v_step_options jsonb;
BEGIN
  -- Extract flow-level options (may be null)
  v_flow_options := p_shape->'options';

  -- Create the flow with options (NULL = use default)
  PERFORM pgflow.create_flow(
    p_flow_slug,
    (v_flow_options->>'maxAttempts')::int,
    (v_flow_options->>'baseDelay')::int,
    (v_flow_options->>'timeout')::int
  );

  -- Iterate over steps in order and add each one
  FOR v_step IN SELECT * FROM jsonb_array_elements(p_shape->'steps')
  LOOP
    -- Convert dependencies jsonb array to text array
    SELECT COALESCE(array_agg(dep), '{}')
    INTO v_deps
    FROM jsonb_array_elements_text(COALESCE(v_step->'dependencies', '[]'::jsonb)) AS dep;

    -- Extract step options (may be null)
    v_step_options := v_step->'options';

    -- Add the step with options (NULL = use default/inherit)
    PERFORM pgflow.add_step(
      flow_slug => p_flow_slug,
      step_slug => v_step->>'slug',
      deps_slugs => v_deps,
      max_attempts => (v_step_options->>'maxAttempts')::int,
      base_delay => (v_step_options->>'baseDelay')::int,
      timeout => (v_step_options->>'timeout')::int,
      start_delay => (v_step_options->>'startDelay')::int,
      step_type => v_step->>'stepType'
    );
  END LOOP;
END;
$$;
-- Create "_get_flow_shape" function
CREATE FUNCTION "pgflow"."_get_flow_shape" ("p_flow_slug" text) RETURNS jsonb LANGUAGE sql STABLE SET "search_path" = '' AS $$
SELECT jsonb_build_object(
    'steps',
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'slug', step.step_slug,
          'stepType', step.step_type,
          'dependencies', COALESCE(
            (
              SELECT jsonb_agg(dep.dep_slug ORDER BY dep.dep_slug)
              FROM pgflow.deps AS dep
              WHERE dep.flow_slug = step.flow_slug
                AND dep.step_slug = step.step_slug
            ),
            '[]'::jsonb
          )
        )
        ORDER BY step.step_index
      ),
      '[]'::jsonb
    )
  )
  FROM pgflow.steps AS step
  WHERE step.flow_slug = p_flow_slug;
$$;
-- Create "delete_flow_and_data" function
CREATE FUNCTION "pgflow"."delete_flow_and_data" ("p_flow_slug" text) RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
BEGIN
  -- Drop queue and archive table (pgmq)
  PERFORM pgmq.drop_queue(p_flow_slug);

  -- Delete all associated data in the correct order (respecting FK constraints)
  DELETE FROM pgflow.step_tasks AS task WHERE task.flow_slug = p_flow_slug;
  DELETE FROM pgflow.step_states AS state WHERE state.flow_slug = p_flow_slug;
  DELETE FROM pgflow.runs AS run WHERE run.flow_slug = p_flow_slug;
  DELETE FROM pgflow.deps AS dep WHERE dep.flow_slug = p_flow_slug;
  DELETE FROM pgflow.steps AS step WHERE step.flow_slug = p_flow_slug;
  DELETE FROM pgflow.flows AS flow WHERE flow.flow_slug = p_flow_slug;
END;
$$;
-- Create "ensure_flow_compiled" function
CREATE FUNCTION "pgflow"."ensure_flow_compiled" ("p_flow_slug" text, "p_shape" jsonb, "p_mode" text DEFAULT 'production') RETURNS jsonb LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  v_lock_key int;
  v_flow_exists boolean;
  v_db_shape jsonb;
  v_differences text[];
BEGIN
  -- Generate lock key from flow_slug (deterministic hash)
  v_lock_key := hashtext(p_flow_slug);

  -- Acquire transaction-level advisory lock
  -- Serializes concurrent compilation attempts for same flow
  PERFORM pg_advisory_xact_lock(1, v_lock_key);

  -- 1. Check if flow exists
  SELECT EXISTS(SELECT 1 FROM pgflow.flows AS flow WHERE flow.flow_slug = p_flow_slug)
  INTO v_flow_exists;

  -- 2. If flow missing: compile (both modes)
  IF NOT v_flow_exists THEN
    PERFORM pgflow._create_flow_from_shape(p_flow_slug, p_shape);
    RETURN jsonb_build_object('status', 'compiled', 'differences', '[]'::jsonb);
  END IF;

  -- 3. Get current shape from DB
  v_db_shape := pgflow._get_flow_shape(p_flow_slug);

  -- 4. Compare shapes
  v_differences := pgflow._compare_flow_shapes(p_shape, v_db_shape);

  -- 5. If shapes match: return verified
  IF array_length(v_differences, 1) IS NULL THEN
    RETURN jsonb_build_object('status', 'verified', 'differences', '[]'::jsonb);
  END IF;

  -- 6. Shapes differ - handle by mode
  IF p_mode = 'development' THEN
    -- Recompile in dev mode: full deletion + fresh compile
    PERFORM pgflow.delete_flow_and_data(p_flow_slug);
    PERFORM pgflow._create_flow_from_shape(p_flow_slug, p_shape);
    RETURN jsonb_build_object('status', 'recompiled', 'differences', to_jsonb(v_differences));
  ELSE
    -- Fail in production mode
    RETURN jsonb_build_object('status', 'mismatch', 'differences', to_jsonb(v_differences));
  END IF;
END;
$$;
