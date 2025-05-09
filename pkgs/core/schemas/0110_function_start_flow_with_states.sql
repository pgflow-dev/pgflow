create or replace function pgflow.start_flow_with_states(
  flow_slug TEXT,
  input JSONB,
  run_id UUID default null
) returns JSONB as $$
DECLARE
  v_run_id UUID;
BEGIN
  -- Start the flow using existing function
  SELECT r.run_id INTO v_run_id FROM pgflow.start_flow(
    start_flow_with_states.flow_slug,
    start_flow_with_states.input,
    start_flow_with_states.run_id
  ) AS r LIMIT 1;

  -- Use get_run_with_states to return the complete state
  RETURN pgflow.get_run_with_states(v_run_id);
END;
$$ language plpgsql;
