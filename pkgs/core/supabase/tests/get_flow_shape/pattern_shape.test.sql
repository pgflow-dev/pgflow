begin;
select plan(2);
select pgflow_tests.reset_db();

-- Setup: Create a flow with pattern conditions
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'step_with_if', max_attempts := 1, required_input_pattern := '{"status": "active"}'::jsonb);
select pgflow.add_step('test_flow', 'step_with_ifnot', max_attempts := 1, forbidden_input_pattern := '{"type": "deleted"}'::jsonb);
select pgflow.add_step('test_flow', 'step_with_both', max_attempts := 1, required_input_pattern := '{"status": "active"}'::jsonb, forbidden_input_pattern := '{"type": "archived"}'::jsonb);

-- Test: Get flow shape with patterns (order matches insertion order: if, ifnot, both)
select is(
  pgflow._get_flow_shape('test_flow'),
  '{
    "steps": [
      {"slug": "step_with_if", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenFailed": "fail", "requiredInputPattern": {"defined": true, "value": {"status": "active"}}, "forbiddenInputPattern": {"defined": false}},
      {"slug": "step_with_ifnot", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenFailed": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": true, "value": {"type": "deleted"}}},
      {"slug": "step_with_both", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenFailed": "fail", "requiredInputPattern": {"defined": true, "value": {"status": "active"}}, "forbiddenInputPattern": {"defined": true, "value": {"type": "archived"}}}
    ]
  }'::jsonb,
  'Should return correct shape with pattern conditions'
);

-- Test: Verify patterns are stored in steps table
select results_eq(
  $$
    SELECT step_slug, required_input_pattern, forbidden_input_pattern
    FROM pgflow.steps
    WHERE flow_slug = 'test_flow'
    ORDER BY step_slug
  $$,
  $$
    SELECT *
    FROM (VALUES
      ('step_with_both', '{"status": "active"}'::jsonb, '{"type": "archived"}'::jsonb),
      ('step_with_if', '{"status": "active"}'::jsonb, NULL::jsonb),
      ('step_with_ifnot', NULL::jsonb, '{"type": "deleted"}'::jsonb)
    ) AS t(step_slug, required_input_pattern, forbidden_input_pattern)
  $$,
  'Pattern columns should be correctly stored in steps table'
);

select finish();
rollback;
