begin;
select plan(4);
select pgflow_tests.reset_db();

-- Test: Compile flow with non-default whenUnmet/whenFailed values
select pgflow._create_flow_from_shape(
  'condition_flow',
  '{
    "steps": [
      {"slug": "always_run", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenFailed": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
      {"slug": "cascade_skip", "stepType": "single", "dependencies": ["always_run"], "whenUnmet": "skip-cascade", "whenFailed": "skip", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
      {"slug": "fail_on_unmet", "stepType": "single", "dependencies": ["always_run"], "whenUnmet": "fail", "whenFailed": "skip-cascade", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
    ]
  }'::jsonb
);

-- Verify when_unmet values were stored correctly
select results_eq(
  $$ SELECT step_slug, when_unmet FROM pgflow.steps WHERE flow_slug = 'condition_flow' ORDER BY step_index $$,
  $$ VALUES ('always_run', 'skip'), ('cascade_skip', 'skip-cascade'), ('fail_on_unmet', 'fail') $$,
  'when_unmet values should be stored correctly'
);

-- Verify when_failed values were stored correctly
select results_eq(
  $$ SELECT step_slug, when_failed FROM pgflow.steps WHERE flow_slug = 'condition_flow' ORDER BY step_index $$,
  $$ VALUES ('always_run', 'fail'), ('cascade_skip', 'skip'), ('fail_on_unmet', 'skip-cascade') $$,
  'when_failed values should be stored correctly'
);

-- Verify shape round-trips correctly with all condition mode variants
select is(
  pgflow._get_flow_shape('condition_flow'),
  '{
    "steps": [
      {"slug": "always_run", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenFailed": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
      {"slug": "cascade_skip", "stepType": "single", "dependencies": ["always_run"], "whenUnmet": "skip-cascade", "whenFailed": "skip", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
      {"slug": "fail_on_unmet", "stepType": "single", "dependencies": ["always_run"], "whenUnmet": "fail", "whenFailed": "skip-cascade", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
    ]
  }'::jsonb,
  'Shape with condition modes should round-trip correctly'
);

-- Verify comparison detects no differences for matching shape
select is(
  pgflow._compare_flow_shapes(
    pgflow._get_flow_shape('condition_flow'),
    '{
      "steps": [
        {"slug": "always_run", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenFailed": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
        {"slug": "cascade_skip", "stepType": "single", "dependencies": ["always_run"], "whenUnmet": "skip-cascade", "whenFailed": "skip", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
        {"slug": "fail_on_unmet", "stepType": "single", "dependencies": ["always_run"], "whenUnmet": "fail", "whenFailed": "skip-cascade", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
      ]
    }'::jsonb
  ),
  '{}'::text[],
  'Matching shapes should have no differences'
);

select finish();
rollback;
