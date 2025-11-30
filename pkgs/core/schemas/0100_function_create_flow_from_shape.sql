-- Compile a flow from a JSONB shape
-- Creates the flow and all its steps using existing create_flow/add_step functions
create or replace function pgflow._create_flow_from_shape(
  p_flow_slug text,
  p_shape jsonb
)
returns void
language plpgsql
volatile
set search_path to ''
as $$
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
