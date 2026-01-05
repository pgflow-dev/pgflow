-- Compile a flow from a JSONB shape
-- Creates the flow and all its steps using existing create_flow/add_step functions
-- Includes options from shape (NULL values = use default)
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
      step_type => v_step->>'stepType',
      when_unmet => v_step->>'whenUnmet',
      when_failed => v_step->>'whenFailed',
      required_input_pattern => CASE
        WHEN (v_step->'requiredInputPattern'->>'defined')::boolean
        THEN v_step->'requiredInputPattern'->'value'
        ELSE NULL
      END,
      forbidden_input_pattern => CASE
        WHEN (v_step->'forbiddenInputPattern'->>'defined')::boolean
        THEN v_step->'forbiddenInputPattern'->'value'
        ELSE NULL
      END
    );
  END LOOP;
END;
$$;
