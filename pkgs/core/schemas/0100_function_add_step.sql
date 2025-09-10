create or replace function pgflow.add_step(
  flow_slug text,
  step_slug text,
  deps_slugs text [] default '{}',
  max_attempts int default null,
  base_delay int default null,
  timeout int default null,
  start_delay int default null,
  step_type text default 'single'
)
returns pgflow.steps
language plpgsql
set search_path to ''
volatile
as $$
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
    opt_max_attempts, opt_base_delay, opt_timeout, opt_start_delay
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
    add_step.start_delay
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
