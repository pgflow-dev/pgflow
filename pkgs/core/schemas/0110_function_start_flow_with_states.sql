create or replace function pgflow.start_flow_with_states(
  flow_slug TEXT,
  input JSONB,
  run_id UUID default null
) returns table (
  run PGFLOW.RUNS,
  steps PGFLOW.STEP_STATES []
) as $$
DECLARE
  v_run_id UUID;
BEGIN
  -- Start the flow using existing function
  SELECT run_id INTO v_run_id FROM pgflow.start_flow(
    start_flow_with_states.flow_slug,
    start_flow_with_states.input,
    start_flow_with_states.run_id
  ) LIMIT 1;

  -- Use get_run_with_states to return the complete state
  RETURN QUERY SELECT * FROM pgflow.get_run_with_states(v_run_id);
END;
$$ language plpgsql;
