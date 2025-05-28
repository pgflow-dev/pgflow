create or replace function pgflow.start_flow_with_states(
  flow_slug text,
  input jsonb,
  run_id uuid default null,
  realtime text default null
) returns jsonb 
language sql
security definer
as $$
WITH started_flow AS (
  SELECT r.run_id 
  FROM pgflow.start_flow($1, $2, $3, $4) AS r 
  LIMIT 1
)
SELECT pgflow.get_run_with_states(sf.run_id)
FROM started_flow sf;
$$;
