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
-- Modify "_create_flow_from_shape" function
CREATE OR REPLACE FUNCTION "pgflow"."_create_flow_from_shape" ("p_flow_slug" text, "p_shape" jsonb) RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
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
