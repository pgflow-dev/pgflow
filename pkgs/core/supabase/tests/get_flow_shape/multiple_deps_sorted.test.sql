begin;
select plan(1);
select pgflow_tests.reset_db();

-- Setup: Create flow where a step has multiple dependencies
-- Dependencies should be returned sorted alphabetically
select pgflow.create_flow('multi_deps');
select pgflow.add_step('multi_deps', 'alpha');
select pgflow.add_step('multi_deps', 'beta');
select pgflow.add_step('multi_deps', 'gamma');
-- 'final' depends on all three - they should appear sorted
select pgflow.add_step('multi_deps', 'final', array['gamma', 'alpha', 'beta']);

-- Test: Dependencies should be sorted alphabetically
select is(
  pgflow._get_flow_shape('multi_deps'),
  '{
    "steps": [
      {"slug": "alpha", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenFailed": "fail"},
      {"slug": "beta", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenFailed": "fail"},
      {"slug": "gamma", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenFailed": "fail"},
      {"slug": "final", "stepType": "single", "dependencies": ["alpha", "beta", "gamma"], "whenUnmet": "skip", "whenFailed": "fail"}
    ]
  }'::jsonb,
  'Dependencies should be sorted alphabetically'
);

select finish();
rollback;
