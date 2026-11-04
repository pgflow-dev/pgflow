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
  when_exhausted text default 'fail'
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
  -- Serialize with ensure_flow_compiled and every other definition writer on
  -- the same normalized flow identity (#651): the max(step_index)+1 read and
  -- the insert below must not interleave with a concurrent compilation of
  -- the same flow. Re-entrant under ensure_flow_compiled's lock; taken
  -- before any table access.
  PERFORM pg_advisory_xact_lock(1, hashtext(lower(add_step.flow_slug)));

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

  -- add_step stays flow-only (#651): a step-mode definition is provisioned
  -- exclusively by the complete-route compilation path. An incremental
  -- add_step on a step-mode flow would bypass complete-route preflight and
  -- persist a route to a queue compilation never created, so it is rejected;
  -- recompile the complete definition instead. Repeated add_step calls on a
  -- flow-mode flow never reset a persisted route: it stays lower(flow_slug).
  IF EXISTS (
    SELECT 1
    FROM pgflow.flows AS f
    WHERE f.flow_slug = add_step.flow_slug
      AND f.queue_mode = 'step'
  ) THEN
    RAISE EXCEPTION
      'Flow "%" uses per-step queues: steps cannot be added incrementally.',
      add_step.flow_slug
      USING detail = 'A step-mode definition is provisioned only by complete compilation.',
      hint = 'Recompile the complete flow definition with every step instead.';
  END IF;

  -- Create the step. queue_name records the step's resolved default route:
  -- lower(flow_slug) for this stage (#650).
  INSERT INTO pgflow.steps (
    flow_slug, step_slug, queue_name, step_type, step_index, deps_count,
    opt_max_attempts, opt_base_delay, opt_timeout, opt_start_delay,
    required_input_pattern, forbidden_input_pattern, when_unmet, when_exhausted
  )
  VALUES (
    add_step.flow_slug,
    add_step.step_slug,
    lower(add_step.flow_slug),
    COALESCE(add_step.step_type, 'single'),
    next_idx,
    COALESCE(array_length(add_step.deps_slugs, 1), 0),
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
  DO UPDATE SET
    step_slug = EXCLUDED.step_slug
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
