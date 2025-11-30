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
