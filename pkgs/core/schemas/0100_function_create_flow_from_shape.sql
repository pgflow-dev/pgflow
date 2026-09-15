-- Compile a flow from a JSONB shape
-- Creates the flow and all its steps using existing create_flow/add_step functions
-- Includes options from shape (NULL values = use default)
--
-- #651: the complete route map is derived unconditionally from the shape
-- and queue mode; caller-supplied routes are never trusted. In 'step' mode
-- the complete preflight (validation, collision, ownership, ambiguity) runs
-- before any PGMQ or definition mutation, and a separate creation phase
-- then provisions queues and definition in this one transaction. A failing
-- preflight or queue operation leaves no partial definition or queue set
-- behind. Step mode is provisioned only here: create_flow() and add_step()
-- stay flow-only, so incremental definition calls cannot create it. Flow
-- mode keeps the default queue lower(flow_slug), including for an empty
-- flow, through the unchanged public create_flow()/add_step() path.
create or replace function pgflow._create_flow_from_shape(
  p_flow_slug text,
  p_shape jsonb,
  p_queue_mode text default 'flow'
)
returns void
language plpgsql
volatile
set search_path = ''
as $$
DECLARE
  v_step jsonb;
  v_step_index int;
  v_deps text[];
  v_flow_options jsonb;
  v_step_options jsonb;
  v_queue_mode text := coalesce(p_queue_mode, 'flow');
  v_routes jsonb;
  v_route jsonb;
  v_queue_name text;
  v_missing text[] := '{}';
BEGIN
  -- Serialize on the same normalized flow identity as ensure_flow_compiled
  -- (#651) so a direct internal call cannot race a concurrent compiler; the
  -- lock re-enters freely when ensure_flow_compiled already holds it. Taken
  -- before the derivation and preflight touch any table or queue.
  PERFORM pg_advisory_xact_lock(1, hashtext(lower(p_flow_slug)));

  -- Derive the complete authoritative route map unconditionally (#651):
  -- startup compilation is authoritative, and every generated name is
  -- resolved, validated through pgmq.validate_queue_name(), and checked for
  -- duplicates here, before anything below can mutate.
  v_routes := pgflow._derive_queue_routes(p_flow_slug, p_shape, v_queue_mode);

  -- Step-mode preflight: complete validation before any PGMQ or definition
  -- mutation, through the one shared helper (_assert_step_queue_available)
  -- that startup verification also uses (#651). Rejects cross-flow
  -- references, unowned listed queues, and ambiguous normalized matches;
  -- an existing definition of this exact flow may reuse its generated
  -- queues idempotently. The helper returns whether the caller must still
  -- create the queue.
  IF v_queue_mode = 'step' THEN
    FOR v_route IN SELECT * FROM jsonb_array_elements(v_routes)
    LOOP
      v_queue_name := v_route->>'queueName';

      IF pgflow._assert_step_queue_available(p_flow_slug, v_queue_name) THEN
        -- Queue creation itself is deferred to the creation phase below so
        -- a later route's preflight failure leaves no partial queue set
        -- (#651).
        v_missing := v_missing || v_queue_name;
      END IF;
    END LOOP;
  END IF;

  -- Creation phase: every queue operation and definition write happens only
  -- after the complete preflight above (#651).
  v_flow_options := p_shape->'options';

  IF v_queue_mode = 'step' THEN
    -- Provision exactly the complete generated step-queue set; no unused
    -- default flow queue is created (#651).
    PERFORM pgmq.create(missing.queue_name)
    FROM unnest(v_missing) AS missing(queue_name);

    -- Step mode is provisioned only here: the definition is written
    -- directly with the derived route map because the public
    -- create_flow()/add_step() path stays flow-only.
    INSERT INTO pgflow.flows (flow_slug, opt_max_attempts, opt_base_delay, opt_timeout, queue_mode)
    VALUES (
      p_flow_slug,
      coalesce((v_flow_options->>'maxAttempts')::int, 3),
      coalesce((v_flow_options->>'baseDelay')::int, 5),
      coalesce((v_flow_options->>'timeout')::int, 60),
      'step'
    )
    ON CONFLICT ON CONSTRAINT flows_pkey
    DO UPDATE
    SET flow_slug = pgflow.flows.flow_slug; -- Dummy update: keep persisted mode

    FOR v_step, v_step_index IN
      SELECT t.step, t.ord
      FROM jsonb_array_elements(p_shape->'steps') WITH ORDINALITY AS t(step, ord)
    LOOP
      SELECT COALESCE(array_agg(dep), '{}')
      INTO v_deps
      FROM jsonb_array_elements_text(COALESCE(v_step->'dependencies', '[]'::jsonb)) AS dep;

      -- Same map-step constraint the public add_step() path enforces
      IF COALESCE(v_step->>'stepType', 'single') = 'map'
        AND COALESCE(array_length(v_deps, 1), 0) > 1 THEN
        RAISE EXCEPTION 'Map step "%" can have at most one dependency, but % were provided: %',
          v_step->>'slug',
          COALESCE(array_length(v_deps, 1), 0),
          array_to_string(v_deps, ', ');
      END IF;

      -- Extract step options (may be null)
      v_step_options := v_step->'options';

      -- The route comes from the derived map by shape ordinality, never
      -- from caller input (#651).
      v_queue_name := v_routes->(v_step_index - 1)->>'queueName';

      INSERT INTO pgflow.steps (
        flow_slug, step_slug, queue_name, step_type, step_index, deps_count,
        opt_max_attempts, opt_base_delay, opt_timeout, opt_start_delay,
        required_input_pattern, forbidden_input_pattern, when_unmet, when_exhausted
      )
      VALUES (
        p_flow_slug,
        v_step->>'slug',
        v_queue_name,
        COALESCE(v_step->>'stepType', 'single'),
        v_step_index - 1,
        COALESCE(array_length(v_deps, 1), 0),
        (v_step_options->>'maxAttempts')::int,
        (v_step_options->>'baseDelay')::int,
        (v_step_options->>'timeout')::int,
        (v_step_options->>'startDelay')::int,
        CASE
          WHEN (v_step->'requiredInputPattern'->>'defined')::boolean
          THEN v_step->'requiredInputPattern'->'value'
          ELSE NULL
        END,
        CASE
          WHEN (v_step->'forbiddenInputPattern'->>'defined')::boolean
          THEN v_step->'forbiddenInputPattern'->'value'
          ELSE NULL
        END,
        COALESCE(v_step->>'whenUnmet', 'skip'),
        COALESCE(v_step->>'whenExhausted', 'fail')
      );

      INSERT INTO pgflow.deps (flow_slug, dep_slug, step_slug)
      SELECT p_flow_slug, d.dep_slug, v_step->>'slug'
      FROM unnest(v_deps) AS d(dep_slug)
      WHERE array_length(v_deps, 1) > 0
      ON CONFLICT ON CONSTRAINT deps_pkey DO NOTHING;
    END LOOP;
  ELSE
    -- Flow mode keeps the public path: create_flow() provisions the default
    -- queue (including for an empty flow) and add_step() persists each step
    -- with its lower(flow_slug) route.
    PERFORM pgflow.create_flow(
      p_flow_slug,
      (v_flow_options->>'maxAttempts')::int,
      (v_flow_options->>'baseDelay')::int,
      (v_flow_options->>'timeout')::int
    );

    FOR v_step IN SELECT * FROM jsonb_array_elements(p_shape->'steps')
    LOOP
      SELECT COALESCE(array_agg(dep), '{}')
      INTO v_deps
      FROM jsonb_array_elements_text(COALESCE(v_step->'dependencies', '[]'::jsonb)) AS dep;

      v_step_options := v_step->'options';

      PERFORM pgflow.add_step(
        flow_slug => p_flow_slug,
        step_slug => v_step->>'slug',
        deps_slugs => v_deps,
        max_attempts => (v_step_options->>'maxAttempts')::int,
        base_delay => (v_step_options->>'baseDelay')::int,
        timeout => (v_step_options->>'timeout')::int,
        start_delay => (v_step_options->>'startDelay')::int,
        step_type => v_step->>'stepType',
        when_unmet => COALESCE(v_step->>'whenUnmet', 'skip'),
        when_exhausted => COALESCE(v_step->>'whenExhausted', 'fail'),
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
  END IF;
END;
$$;
