create or replace function pgflow.get_run_with_states(
  run_id UUID
) returns JSONB as $$
  SELECT jsonb_build_object(
    'run', to_jsonb(r),
    'steps', COALESCE(jsonb_agg(to_jsonb(s)) FILTER (WHERE s.run_id IS NOT NULL), '[]'::jsonb)
  )
  FROM pgflow.runs r
  LEFT JOIN pgflow.step_states s ON s.run_id = r.run_id
  WHERE r.run_id = get_run_with_states.run_id
  GROUP BY r.run_id;
$$ language sql security definer;
