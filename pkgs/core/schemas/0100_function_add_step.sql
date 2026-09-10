create or replace function pgflow.add_step(
  flow_slug text,
  step_slug text,
  deps_slugs text [] default '{}',
  max_attempts int default null,
  base_delay int default null,
  timeout int default null,
  start_delay int default null,
  step_type text default 'single',
  required_input_pattern jsonb default null,
  forbidden_input_pattern jsonb default null,
  when_unmet text default 'skip',
  when_exhausted text default 'fail',
  queue_name text default null
)
returns pgflow.steps
language plpgsql
set search_path = ''
volatile
as $$
DECLARE
  result_step pgflow.steps;
  next_idx int;
  v_queue_name text;
  v_alias_slug text;
BEGIN
  -- Canonical flow lock shared with compilation and deletion
  PERFORM pg_advisory_xact_lock(1, hashtext(lower(add_step.flow_slug)));

  -- Lock the exact concrete flow row before calculating the next step index
  IF NOT EXISTS (
    SELECT 1 FROM pgflow.flows f
    WHERE f.flow_slug = add_step.flow_slug
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Flow % does not exist', add_step.flow_slug;
  END IF;

  -- Resolve the route: omitted defaults to the canonical generated queue;
  -- an explicit equal canonical route is accepted, a different route is not.
  v_queue_name := COALESCE(add_step.queue_name, lower(add_step.flow_slug));
  IF add_step.queue_name IS NOT NULL AND add_step.queue_name <> lower(add_step.flow_slug) THEN
    RAISE EXCEPTION 'Flow %: step "%" cannot use queue "%" (custom routes do not exist in #650; the canonical route is "%")',
      add_step.flow_slug, add_step.step_slug, add_step.queue_name, lower(add_step.flow_slug);
  END IF;

  -- Validate the step slug and map constraints before any provisioning
  IF NOT pgflow.is_valid_slug(add_step.step_slug) THEN
    RAISE EXCEPTION 'Flow %: "%" is not a valid step slug', add_step.flow_slug, add_step.step_slug;
  END IF;

  IF COALESCE(add_step.step_type, 'single') = 'map' AND COALESCE(array_length(add_step.deps_slugs, 1), 0) > 1 THEN
    RAISE EXCEPTION 'Map step "%" can have at most one dependency, but % were provided: %',
      add_step.step_slug,
      COALESCE(array_length(add_step.deps_slugs, 1), 0),
      array_to_string(add_step.deps_slugs, ', ');
  END IF;

  -- Dependencies must reference existing steps of this exact flow
  PERFORM 1
  FROM unnest(COALESCE(add_step.deps_slugs, '{}')) AS d(dep_slug)
  WHERE NOT EXISTS (
    SELECT 1 FROM pgflow.steps s
    WHERE s.flow_slug = add_step.flow_slug
      AND s.step_slug = d.dep_slug
  );
  IF FOUND THEN
    RAISE EXCEPTION 'Flow %: step "%" has a dependency that does not exist', add_step.flow_slug, add_step.step_slug;
  END IF;

  -- Case-alias precheck before the unique index; names both spellings
  SELECT s.step_slug INTO v_alias_slug
  FROM pgflow.steps s
  WHERE s.flow_slug = add_step.flow_slug
    AND lower(s.step_slug) = lower(add_step.step_slug)
    AND s.step_slug <> add_step.step_slug
  LIMIT 1;
  IF v_alias_slug IS NOT NULL THEN
    RAISE SQLSTATE '23505' USING MESSAGE = format(
      'Flow %s: step "%s" conflicts with existing step "%s" (case-insensitive step namespace)',
      add_step.flow_slug, add_step.step_slug, v_alias_slug
    );
  END IF;

  -- Provision/verify the generated queue through the shared ownership path
  PERFORM pgflow._ensure_generated_queue(add_step.flow_slug, v_queue_name);

  -- Get next step index (under the flow row lock)
  SELECT COALESCE(MAX(s.step_index) + 1, 0) INTO next_idx
  FROM pgflow.steps s
  WHERE s.flow_slug = add_step.flow_slug;

  -- Create the step with its resolved route snapshot
  INSERT INTO pgflow.steps (
    flow_slug, step_slug, step_type, step_index, deps_count, queue_name,
    opt_max_attempts, opt_base_delay, opt_timeout, opt_start_delay,
    required_input_pattern, forbidden_input_pattern, when_unmet, when_exhausted
  )
  VALUES (
    add_step.flow_slug,
    add_step.step_slug,
    COALESCE(add_step.step_type, 'single'),
    next_idx,
    COALESCE(array_length(add_step.deps_slugs, 1), 0),
    v_queue_name,
    add_step.max_attempts,
    add_step.base_delay,
    add_step.timeout,
    add_step.start_delay,
    add_step.required_input_pattern,
    add_step.forbidden_input_pattern,
    add_step.when_unmet,
    add_step.when_exhausted
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
