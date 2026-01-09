begin;
select plan(2);
select pgflow_tests.reset_db();

-- Test: Compile flow with map step
select pgflow._create_flow_from_shape(
  'map_flow',
  '{
    "steps": [
      {"slug": "root_map", "stepType": "map", "dependencies": [], "whenUnmet": "skip", "whenFailed": "fail"},
      {"slug": "process", "stepType": "single", "dependencies": ["root_map"], "whenUnmet": "skip", "whenFailed": "fail"}
    ]
  }'::jsonb
);

-- Verify map step was created with correct type
select is(
  (select step_type from pgflow.steps where flow_slug = 'map_flow' and step_slug = 'root_map'),
  'map',
  'Map step should have step_type = map'
);

-- Verify shape round-trips correctly
select is(
  pgflow._get_flow_shape('map_flow'),
  '{
    "steps": [
      {"slug": "root_map", "stepType": "map", "dependencies": [], "whenUnmet": "skip", "whenFailed": "fail"},
      {"slug": "process", "stepType": "single", "dependencies": ["root_map"], "whenUnmet": "skip", "whenFailed": "fail"}
    ]
  }'::jsonb,
  'Shape should round-trips correctly'
);

select finish();
rollback;
