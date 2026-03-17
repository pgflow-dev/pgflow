begin;
select plan(3);
select pgflow_tests.reset_db();

-- Setup: Create a flow with specific condition modes
select pgflow.create_flow('drift_test');
select pgflow.add_step(
  flow_slug => 'drift_test',
  step_slug => 'step1',
  when_unmet => 'skip',
  when_exhausted => 'fail'
);

-- Test: Detect whenUnmet drift
select is(
  pgflow._compare_flow_shapes(
    '{
      "steps": [
        {"slug": "step1", "stepType": "single", "dependencies": [], "whenUnmet": "skip-cascade", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
      ]
    }'::jsonb,
    pgflow._get_flow_shape('drift_test')
  ),
  ARRAY[$$Step at index 0: whenUnmet differs 'skip-cascade' vs 'skip'$$],
  'Should detect whenUnmet mismatch'
);

-- Test: Detect whenExhausted drift
select is(
  pgflow._compare_flow_shapes(
    '{
      "steps": [
        {"slug": "step1", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "skip-cascade", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
      ]
    }'::jsonb,
    pgflow._get_flow_shape('drift_test')
  ),
  ARRAY[$$Step at index 0: whenExhausted differs 'skip-cascade' vs 'fail'$$],
  'Should detect whenExhausted mismatch'
);

-- Test: Detect both whenUnmet and whenExhausted drift simultaneously
select is(
  pgflow._compare_flow_shapes(
    '{
      "steps": [
        {"slug": "step1", "stepType": "single", "dependencies": [], "whenUnmet": "fail", "whenExhausted": "skip", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
      ]
    }'::jsonb,
    pgflow._get_flow_shape('drift_test')
  ),
  ARRAY[
    $$Step at index 0: whenUnmet differs 'fail' vs 'skip'$$,
    $$Step at index 0: whenExhausted differs 'skip' vs 'fail'$$
  ],
  'Should detect both condition mode mismatches'
);

select finish();
rollback;
