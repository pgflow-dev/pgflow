CREATE OR REPLACE FUNCTION pgflow.get_run_with_states(
  p_run_id UUID
) RETURNS TABLE(
  run PGFLOW.RUNS,
  steps PGFLOW.STEP_STATES[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.*,
    ARRAY(
      SELECT s FROM pgflow.step_states s 
      WHERE s.run_id = p_run_id
      ORDER BY s.step_slug
    ) as steps
  FROM pgflow.runs r
  WHERE r.run_id = p_run_id;
END;
$$ LANGUAGE plpgsql;