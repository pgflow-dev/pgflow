-- Create "_create_flow_from_shape" function
CREATE FUNCTION "pgflow"."_create_flow_from_shape" ("p_flow_slug" text, "p_shape" jsonb) RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  v_step jsonb;
  v_deps text[];
BEGIN
  -- Create the flow with defaults
  PERFORM pgflow.create_flow(p_flow_slug);

  -- Iterate over steps in order and add each one
  FOR v_step IN SELECT * FROM jsonb_array_elements(p_shape->'steps')
  LOOP
    -- Convert dependencies jsonb array to text array
    SELECT COALESCE(array_agg(dep), '{}')
    INTO v_deps
    FROM jsonb_array_elements_text(COALESCE(v_step->'dependencies', '[]'::jsonb)) AS dep;

    -- Add the step
    PERFORM pgflow.add_step(
      flow_slug => p_flow_slug,
      step_slug => v_step->>'slug',
      deps_slugs => v_deps,
      step_type => v_step->>'stepType'
    );
  END LOOP;
END;
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
