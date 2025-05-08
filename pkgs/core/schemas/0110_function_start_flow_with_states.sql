CREATE OR REPLACE FUNCTION pgflow.start_flow_with_states(
  p_flow_slug TEXT,
  p_input JSONB,
  p_run_id UUID DEFAULT NULL
) RETURNS TABLE(
  run PGFLOW.RUNS,
  steps PGFLOW.STEP_STATES[]
) AS $$
DECLARE
  v_run_id UUID;
BEGIN
  -- Start the flow using existing function
  SELECT run_id INTO v_run_id FROM pgflow.start_flow(p_flow_slug, p_input, p_run_id) LIMIT 1;
  
  -- Use get_run_with_states to return the complete state
  RETURN QUERY SELECT * FROM pgflow.get_run_with_states(v_run_id);
END;
$$ LANGUAGE plpgsql;