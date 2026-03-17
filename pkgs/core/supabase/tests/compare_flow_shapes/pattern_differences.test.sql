begin;
select plan(5);
select pgflow_tests.reset_db();

-- Test: Patterns with same value should match
select is(
  pgflow._compare_flow_shapes(
    '{
      "steps": [
        {"slug": "step1", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": true, "value": {"status": "active"}}, "forbiddenInputPattern": {"defined": false}}
      ]
    }'::jsonb,
    '{
      "steps": [
        {"slug": "step1", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": true, "value": {"status": "active"}}, "forbiddenInputPattern": {"defined": false}}
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
        {"slug": "step1", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": true, "value": {"status": "active"}}, "forbiddenInputPattern": {"defined": false}}
      ]
    }'::jsonb,
    '{
      "steps": [
        {"slug": "step1", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": true, "value": {"status": "pending"}}, "forbiddenInputPattern": {"defined": false}}
      ]
    }'::jsonb
  ),
  ARRAY['Step at index 0: requiredInputPattern differs ''{"value": {"status": "active"}, "defined": true}'' vs ''{"value": {"status": "pending"}, "defined": true}''']::text[],
  'Different requiredInputPattern values should be detected'
);

-- Test: Different forbiddenInputPattern should be detected
select is(
  pgflow._compare_flow_shapes(
    '{
      "steps": [
        {"slug": "step1", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": true, "value": {"role": "user"}}, "forbiddenInputPattern": {"defined": true, "value": {"role": "admin"}}}
      ]
    }'::jsonb,
    '{
      "steps": [
        {"slug": "step1", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": true, "value": {"role": "user"}}, "forbiddenInputPattern": {"defined": true, "value": {"role": "banned"}}}
      ]
    }'::jsonb
  ),
  ARRAY['Step at index 0: forbiddenInputPattern differs ''{"value": {"role": "admin"}, "defined": true}'' vs ''{"value": {"role": "banned"}, "defined": true}''']::text[],
  'Different forbiddenInputPattern values should be detected'
);

-- Test: forbiddenInputPattern defined transition should be detected
select is(
  pgflow._compare_flow_shapes(
    '{
      "steps": [
        {"slug": "step1", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
      ]
    }'::jsonb,
    '{
      "steps": [
        {"slug": "step1", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": true, "value": {"admin": true}}}
      ]
    }'::jsonb
  ),
  ARRAY['Step at index 0: forbiddenInputPattern differs ''{"defined": false}'' vs ''{"value": {"admin": true}, "defined": true}''']::text[],
  'forbiddenInputPattern defined transition should be detected'
);

-- Test: requiredInputPattern defined transition should be detected
select is(
  pgflow._compare_flow_shapes(
    '{
      "steps": [
        {"slug": "step1", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
      ]
    }'::jsonb,
    '{
      "steps": [
        {"slug": "step1", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": true, "value": {"status": "ready"}}, "forbiddenInputPattern": {"defined": false}}
      ]
    }'::jsonb
  ),
  ARRAY['Step at index 0: requiredInputPattern differs ''{"defined": false}'' vs ''{"value": {"status": "ready"}, "defined": true}''']::text[],
  'requiredInputPattern defined transition should be detected'
);

select finish();
rollback;
