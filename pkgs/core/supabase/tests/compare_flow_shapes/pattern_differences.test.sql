begin;
select plan(2);
select pgflow_tests.reset_db();

-- Test: Patterns with same value should match
select is(
  pgflow._compare_flow_shapes(
    '{
      "steps": [
        {"slug": "step1", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenFailed": "fail", "requiredInputPattern": {"defined": true, "value": {"status": "active"}}, "forbiddenInputPattern": {"defined": false}}
      ]
    }'::jsonb,
    '{
      "steps": [
        {"slug": "step1", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenFailed": "fail", "requiredInputPattern": {"defined": true, "value": {"status": "active"}}, "forbiddenInputPattern": {"defined": false}}
      ]
    }'::jsonb
  ),
  '{}'::text[],
  'Shapes with identical patterns should have no differences'
);

-- Test: Different requiredInputPattern should be detected
select is(
  pgflow._compare_flow_shapes(
    '{
      "steps": [
        {"slug": "step1", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenFailed": "fail", "requiredInputPattern": {"defined": true, "value": {"status": "active"}}, "forbiddenInputPattern": {"defined": false}}
      ]
    }'::jsonb,
    '{
      "steps": [
        {"slug": "step1", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenFailed": "fail", "requiredInputPattern": {"defined": true, "value": {"status": "pending"}}, "forbiddenInputPattern": {"defined": false}}
      ]
    }'::jsonb
  ),
  ARRAY['Step at index 0: requiredInputPattern differs ''{"value": {"status": "active"}, "defined": true}'' vs ''{"value": {"status": "pending"}, "defined": true}''']::text[],
  'Different requiredInputPattern values should be detected'
);

select finish();
rollback;
