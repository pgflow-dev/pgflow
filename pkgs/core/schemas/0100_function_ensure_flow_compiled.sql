-- Ensure a flow is compiled in the database
-- Auto-detects environment via is_local(): local -> auto-recompile, production -> fail on mismatch
-- Returns: { status: 'compiled' | 'verified' | 'recompiled' | 'mismatch',
--            differences: text[], mismatchKind: 'shape' | 'routing' | null }
--
-- #651: receives the complete shape, the queue mode, and the ordered
-- (step_slug, queue_name) route map. SQL derives the authoritative routes
-- from shape and mode under the existing normalized concrete-slug
-- transaction lock and compares the supplied map; arbitrary caller-supplied
-- queue names are never accepted. An existing definition must match shape,
-- mode, and complete route map: mode or route mismatches are deployment
-- (routing) mismatches, distinct from shape drift. Local mode destructively
-- recompiles (deleting old runtime data and private queues) only after the
-- complete derivation succeeds, so an invalid recompilation rolls back
-- without losing the old definition, queues, or runtime data.
create or replace function pgflow.ensure_flow_compiled(
  flow_slug text,
  shape jsonb,
  queue_mode text default 'flow',
  route_map jsonb default null
)
returns jsonb
language plpgsql
volatile
set search_path to ''
as $$
DECLARE
  v_lock_key int;
  v_flow_exists boolean;
  v_db_shape jsonb;
  v_differences text[];
  v_routing_differences text[];
  v_is_local boolean;
  v_queue_mode text := coalesce(ensure_flow_compiled.queue_mode, 'flow');
  v_routes jsonb;
  v_supplied jsonb;
  v_expected text[];
  v_actual text[];
  v_idx int;
  v_kind text;
BEGIN
  -- Generate lock key from the normalized flow identity (deterministic hash)
  v_lock_key := hashtext(lower(ensure_flow_compiled.flow_slug));

  -- Acquire transaction-level advisory lock
  -- Serializes concurrent compilation attempts for same flow
  PERFORM pg_advisory_xact_lock(1, v_lock_key);

  -- Derive the complete authoritative route map before any mutation
  v_routes := pgflow._derive_queue_routes(ensure_flow_compiled.flow_slug, ensure_flow_compiled.shape, v_queue_mode);

  -- A supplied route map must match the derivation exactly: no missing,
  -- extra, duplicate, reordered, or mismatched entries.
  v_supplied := ensure_flow_compiled.route_map;
  IF v_supplied IS NOT NULL THEN
    IF jsonb_array_length(v_supplied) <> jsonb_array_length(v_routes) THEN
      RAISE EXCEPTION
        'supplied route map for flow "%" has % entries but % step(s) was derived',
        ensure_flow_compiled.flow_slug, jsonb_array_length(v_supplied), jsonb_array_length(v_routes)
        USING detail = 'The route map must cover the complete ordered shape exactly.',
        hint = 'Pass withStepQueues() route snapshots or omit the map to let SQL derive it.';
    END IF;
    FOR v_idx IN 0..jsonb_array_length(v_routes) - 1 LOOP
      IF (v_supplied->v_idx->>'stepSlug') IS DISTINCT FROM (v_routes->v_idx->>'stepSlug')
        OR (v_supplied->v_idx->>'queueName') IS DISTINCT FROM (v_routes->v_idx->>'queueName') THEN
        RAISE EXCEPTION
          'supplied route map for flow "%" disagrees with the derived route at position %',
          ensure_flow_compiled.flow_slug, v_idx + 1
          USING detail = format(
            'Supplied (%s, %s); derived (%s, %s).',
            v_supplied->v_idx->>'stepSlug', v_supplied->v_idx->>'queueName',
            v_routes->v_idx->>'stepSlug', v_routes->v_idx->>'queueName'
          ),
          hint = 'SQL derives queue names from the flow slug, step slugs, and shape order; fix the supplied map.';
      END IF;
    END LOOP;
  END IF;

  -- 1. Check if flow exists
  SELECT EXISTS(SELECT 1 FROM pgflow.flows AS flow WHERE flow.flow_slug = ensure_flow_compiled.flow_slug)
  INTO v_flow_exists;

  -- 2. If flow missing: compile (both environments)
  IF NOT v_flow_exists THEN
    PERFORM pgflow._create_flow_from_shape(ensure_flow_compiled.flow_slug, ensure_flow_compiled.shape, v_queue_mode);
    RETURN jsonb_build_object('status', 'compiled', 'differences', '[]'::jsonb, 'mismatchKind', null);
  END IF;

  -- 3. Compare shape and, independently, queue mode and complete route map
  v_db_shape := pgflow._get_flow_shape(ensure_flow_compiled.flow_slug);
  v_differences := pgflow._compare_flow_shapes(ensure_flow_compiled.shape, v_db_shape);

  SELECT array_agg(route.step_slug || ' -> ' || route.queue_name)
  INTO v_actual
  FROM (
    SELECT s.step_slug, s.queue_name
    FROM pgflow.steps AS s
    WHERE s.flow_slug = ensure_flow_compiled.flow_slug
    ORDER BY s.step_index
  ) AS route;

  SELECT array_agg(route.step_slug || ' -> ' || route.queue_name)
  INTO v_expected
  FROM (
    SELECT r.obj->>'stepSlug' AS step_slug, r.obj->>'queueName' AS queue_name
    FROM jsonb_array_elements(v_routes) WITH ORDINALITY AS r(obj, ord)
    ORDER BY r.ord
  ) AS route;

  v_routing_differences := '{}';

  IF (SELECT f.queue_mode FROM pgflow.flows AS f WHERE f.flow_slug = ensure_flow_compiled.flow_slug)
     IS DISTINCT FROM v_queue_mode THEN
    v_routing_differences := array_append(
      v_routing_differences,
      format(
        'Queue mode differs: database has ''%s'', worker expects ''%s''',
        (SELECT f.queue_mode FROM pgflow.flows AS f WHERE f.flow_slug = ensure_flow_compiled.flow_slug),
        v_queue_mode
      )
    );
  END IF;

  IF v_actual IS DISTINCT FROM v_expected THEN
    v_routing_differences := array_append(
      v_routing_differences,
      format(
        'Step routes differ: database has [%s], worker expects [%s]',
        coalesce(array_to_string(v_actual, ', '), ''),
        coalesce(array_to_string(v_expected, ', '), '')
      )
    );
  END IF;

  -- 4. Everything matches: before returning verified, run the shared
  -- route preflight under this transaction's normalized advisory lock
  -- (#651). Every startup checks its queues: compilation and local
  -- recompilation preflight through _create_flow_from_shape, and a
  -- verified startup preflights here. Cross-flow references and ambiguous
  -- case-insensitive listed-queue matches are rejected even for an
  -- already-existing verified definition; the one exact listed queue is
  -- allowed only because the verified definition owns that route.
  IF array_length(v_differences, 1) IS NULL AND array_length(v_routing_differences, 1) IS NULL THEN
    IF v_queue_mode = 'step' THEN
      PERFORM pgflow._assert_step_queue_available(
        ensure_flow_compiled.flow_slug,
        route->>'queueName'
      )
      FROM jsonb_array_elements(v_routes) AS route;
    END IF;

    RETURN jsonb_build_object('status', 'verified', 'differences', '[]'::jsonb, 'mismatchKind', null);
  END IF;

  -- Routing drift counts as the dedicated routing mismatch kind only when
  -- the shape itself matches: a shape change can imply route changes because
  -- routes derive from the shape order.
  v_kind := CASE
    WHEN array_length(v_differences, 1) IS NULL
      AND array_length(v_routing_differences, 1) IS NOT NULL
    THEN 'routing' ELSE 'shape' END;
  v_differences := v_differences || v_routing_differences;

  -- 5. Auto-detect environment via is_local()
  v_is_local := pgflow.is_local();

  -- Local mode is the only destructive branch; production mismatches never
  -- delete data and return mismatch so worker startup fails.
  IF v_is_local THEN
    -- Recompile in local/dev: full deletion + fresh compile. The complete
    -- derivation above already succeeded, so an invalid recompilation
    -- (for example a foreign queue collision) rolls the whole statement
    -- back, preserving the old definition and queues.
    PERFORM pgflow.delete_flow_and_data(ensure_flow_compiled.flow_slug);
    PERFORM pgflow._create_flow_from_shape(ensure_flow_compiled.flow_slug, ensure_flow_compiled.shape, v_queue_mode);
    RETURN jsonb_build_object('status', 'recompiled', 'differences', to_jsonb(v_differences), 'mismatchKind', null);
  ELSE
    -- Fail in production; routing drift is reported with a dedicated kind
    RETURN jsonb_build_object(
      'status', 'mismatch',
      'differences', to_jsonb(v_differences),
      'mismatchKind', v_kind
    );
  END IF;
END;
$$;
