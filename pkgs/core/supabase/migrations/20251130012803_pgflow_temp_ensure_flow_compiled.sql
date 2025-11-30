-- Create "ensure_flow_compiled" function
CREATE FUNCTION "pgflow"."ensure_flow_compiled" ("p_flow_slug" text, "p_shape" jsonb, "p_mode" text DEFAULT 'production') RETURNS jsonb LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  v_flow_exists boolean;
  v_db_shape jsonb;
  v_differences text[];
BEGIN
  -- 1. Check if flow exists
  SELECT EXISTS(SELECT 1 FROM pgflow.flows AS flow WHERE flow.flow_slug = p_flow_slug)
  INTO v_flow_exists;

  -- 2. If flow missing: compile (both modes)
  IF NOT v_flow_exists THEN
    PERFORM pgflow._create_flow_from_shape(p_flow_slug, p_shape);
    RETURN jsonb_build_object('status', 'compiled', 'differences', '[]'::jsonb);
  END IF;

  -- 3. Get current shape from DB
  v_db_shape := pgflow._get_flow_shape(p_flow_slug);

  -- 4. Compare shapes
  v_differences := pgflow._compare_flow_shapes(p_shape, v_db_shape);

  -- 5. If shapes match: return verified
  IF array_length(v_differences, 1) IS NULL THEN
    RETURN jsonb_build_object('status', 'verified', 'differences', '[]'::jsonb);
  END IF;

  -- 6. Shapes differ - handle by mode
  IF p_mode = 'development' THEN
    -- Recompile in dev mode: full deletion + fresh compile
    PERFORM pgflow.delete_flow_and_data(p_flow_slug);
    PERFORM pgflow._create_flow_from_shape(p_flow_slug, p_shape);
    RETURN jsonb_build_object('status', 'recompiled', 'differences', to_jsonb(v_differences));
  ELSE
    -- Fail in production mode
    RETURN jsonb_build_object('status', 'mismatch', 'differences', to_jsonb(v_differences));
  END IF;
END;
$$;
