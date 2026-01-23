begin;
select plan(1);
select pgflow_tests.reset_db();

-- Setup: Create flow with map steps
select pgflow.create_flow('map_flow');
select pgflow.add_step(
  flow_slug => 'map_flow',
  step_slug => 'root_map',
  step_type => 'map'
);
select pgflow.add_step(
  flow_slug => 'map_flow',
  step_slug => 'process',
  deps_slugs => array['root_map']
);

-- Test: Get flow shape with map step
select is(
  pgflow._get_flow_shape('map_flow'),
  '{
    "steps": [
      {"slug": "root_map", "stepType": "map", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
      {"slug": "process", "stepType": "single", "dependencies": ["root_map"], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
    ]
  }'::jsonb,
  'Should correctly identify map step type'
);

select finish();
rollback;
