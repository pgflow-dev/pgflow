create or replace function pgflow.get_run_with_states(
  _run_id UUID
) returns table (
  run PGFLOW.RUNS,
  steps PGFLOW.STEP_STATES []
) as $$
BEGIN
  RETURN QUERY
  SELECT
    r.*,
    ARRAY(
      SELECT s FROM pgflow.step_states s
      WHERE s.run_id = get_run_with_states.run_id
      ORDER BY s.step_slug
    ) as steps
  FROM pgflow.runs r
  WHERE r.run_id = get_run_with_states.run_id;
END;
$$ language plpgsql;
