-- Drop old 2-parameter version before creating new 3-parameter version
DROP FUNCTION IF EXISTS "pgflow"."ensure_flow_compiled" (text, jsonb);

-- Create "ensure_flow_compiled" function with allow_data_loss parameter
CREATE FUNCTION "pgflow"."ensure_flow_compiled" ("flow_slug" text, "shape" jsonb, "allow_data_loss" boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  v_lock_key int;
  v_flow_exists boolean;
  v_db_shape jsonb;
  v_differences text[];
  v_is_local boolean;
BEGIN
  -- Generate lock key from flow_slug (deterministic hash)
  v_lock_key := hashtext(ensure_flow_compiled.flow_slug);

  -- Acquire transaction-level advisory lock
  -- Serializes concurrent compilation attempts for same flow
  PERFORM pg_advisory_xact_lock(1, v_lock_key);

  -- 1. Check if flow exists
  SELECT EXISTS(SELECT 1 FROM pgflow.flows AS flow WHERE flow.flow_slug = ensure_flow_compiled.flow_slug)
  INTO v_flow_exists;

  -- 2. If flow missing: compile (both environments)
  IF NOT v_flow_exists THEN
    PERFORM pgflow._create_flow_from_shape(ensure_flow_compiled.flow_slug, ensure_flow_compiled.shape);
    RETURN jsonb_build_object('status', 'compiled', 'differences', '[]'::jsonb);
  END IF;

  -- 3. Get current shape from DB
  v_db_shape := pgflow._get_flow_shape(ensure_flow_compiled.flow_slug);

  -- 4. Compare shapes
  v_differences := pgflow._compare_flow_shapes(ensure_flow_compiled.shape, v_db_shape);

  -- 5. If shapes match: return verified
  IF array_length(v_differences, 1) IS NULL THEN
    RETURN jsonb_build_object('status', 'verified', 'differences', '[]'::jsonb);
  END IF;

  -- 6. Shapes differ - auto-detect environment via is_local()
  v_is_local := pgflow.is_local();

  IF v_is_local OR allow_data_loss THEN
    -- Recompile in local/dev: full deletion + fresh compile
    PERFORM pgflow.delete_flow_and_data(ensure_flow_compiled.flow_slug);
    PERFORM pgflow._create_flow_from_shape(ensure_flow_compiled.flow_slug, ensure_flow_compiled.shape);
    RETURN jsonb_build_object('status', 'recompiled', 'differences', to_jsonb(v_differences));
  ELSE
    -- Fail in production
    RETURN jsonb_build_object('status', 'mismatch', 'differences', to_jsonb(v_differences));
  END IF;
END;
$$;
