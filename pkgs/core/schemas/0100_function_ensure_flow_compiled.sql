-- Ensure a flow is compiled in the database
-- Auto-detects environment via is_local(): local -> auto-recompile, production -> fail on mismatch
-- Returns: { status: 'compiled' | 'verified' | 'recompiled' | 'mismatch', differences: text[], queue_name }
-- #650: all non-mismatch results carry the checked canonical queue; the
-- verified branch also proves the persisted route's physical resources.
create or replace function pgflow.ensure_flow_compiled(
  flow_slug text,
  shape jsonb,
  worker_protocol jsonb
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
DECLARE
  v_lock_key int;
  v_flow_exists boolean;
  v_db_shape jsonb;
  v_differences text[];
  v_is_local boolean;
  v_canonical_queue text := lower(ensure_flow_compiled.flow_slug);
BEGIN
  -- Queue-capable startup handshake (#650): the required third argument has
  -- no default and no fallback wrapper. Version 1 identifies the queue-aware
  -- startup/claim semantics. Reject missing/non-object/wrong-version values
  -- before any definition mutation.
  IF jsonb_typeof(worker_protocol) IS DISTINCT FROM 'object'
     OR worker_protocol -> 'version' IS DISTINCT FROM '1'::jsonb THEN
    RAISE EXCEPTION 'Queue-capable worker protocol version 1 is required';
  END IF;
  -- Generate lock key from the canonical slug (deterministic hash).
  -- Case aliases share the lock so concurrent compilation of 'Orders' and
  -- 'orders' serializes against each other.
  v_lock_key := hashtext(lower(ensure_flow_compiled.flow_slug));

  -- Acquire transaction-level advisory lock
  -- Serializes concurrent compilation attempts for same flow
  PERFORM pg_advisory_xact_lock(1, v_lock_key);

  -- 1. Check if flow exists
  SELECT EXISTS(SELECT 1 FROM pgflow.flows AS flow WHERE flow.flow_slug = ensure_flow_compiled.flow_slug)
  INTO v_flow_exists;

  -- 2. If flow missing: compile (both environments)
  IF NOT v_flow_exists THEN
    PERFORM pgflow._create_flow_from_shape(ensure_flow_compiled.flow_slug, ensure_flow_compiled.shape);
    RETURN jsonb_build_object(
      'status', 'compiled',
      'differences', '[]'::jsonb,
      'protocol_version', 1,
      'queue_name', v_canonical_queue
    );
  END IF;

  -- 3. Get current shape from DB
  v_db_shape := pgflow._get_flow_shape(ensure_flow_compiled.flow_slug);

  -- 4. Compare shapes
  v_differences := pgflow._compare_flow_shapes(ensure_flow_compiled.shape, v_db_shape);

  -- 5. If shapes match: inspect the persisted route/resources before
  -- returning verified. A shape match alone does not prove a valid queue.
  IF array_length(v_differences, 1) IS NULL THEN
    PERFORM pgflow._inspect_generated_queue(
      ensure_flow_compiled.flow_slug,
      v_canonical_queue,
      true
    );
    RETURN jsonb_build_object(
      'status', 'verified',
      'differences', '[]'::jsonb,
      'protocol_version', 1,
      'queue_name', v_canonical_queue
    );
  END IF;

  -- 6. Shapes differ - auto-detect environment via is_local()
  v_is_local := pgflow.is_local();

  -- Local mode is the only destructive branch; production mismatches never
  -- delete data and return mismatch so worker startup fails.
  IF v_is_local THEN
    -- Preflight the entire replacement shape before any deletion so a bad
    -- late step cannot destroy old data. Deletion follows the established
    -- runtime-before-metadata lock order.
    PERFORM pgflow._validate_flow_shape(ensure_flow_compiled.flow_slug, ensure_flow_compiled.shape);

    PERFORM pgflow.delete_flow_and_data(ensure_flow_compiled.flow_slug);
    PERFORM pgflow._create_flow_from_shape(ensure_flow_compiled.flow_slug, ensure_flow_compiled.shape);
    RETURN jsonb_build_object(
      'status', 'recompiled',
      'differences', to_jsonb(v_differences),
      'protocol_version', 1,
      'queue_name', v_canonical_queue
    );
  ELSE
    -- Fail in production
    RETURN jsonb_build_object(
      'status', 'mismatch',
      'differences', to_jsonb(v_differences)
    );
  END IF;
END;
$$;
