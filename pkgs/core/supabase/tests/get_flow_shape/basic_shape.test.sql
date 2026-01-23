begin;
select plan(1);
select pgflow_tests.reset_db();

-- Setup: Create a simple flow with 3 steps
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'first');
select pgflow.add_step('test_flow', 'second', array['first']);
select pgflow.add_step('test_flow', 'third', array['second']);

-- Test: Get flow shape
select is(
  pgflow._get_flow_shape('test_flow'),
  '{
    "steps": [
      {"slug": "first", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
      {"slug": "second", "stepType": "single", "dependencies": ["first"], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
      {"slug": "third", "stepType": "single", "dependencies": ["second"], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
    ]
  }'::jsonb,
  'Should return correct shape for simple sequential flow'
);

select finish();
rollback;
