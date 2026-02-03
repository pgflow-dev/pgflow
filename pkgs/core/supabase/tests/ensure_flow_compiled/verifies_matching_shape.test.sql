begin;
select plan(2);
select pgflow_tests.reset_db();

-- Setup: Create flow first
select pgflow.create_flow('existing_flow');
select pgflow.add_step('existing_flow', 'first');
select pgflow.add_step('existing_flow', 'second', array['first']);

-- Test: Matching shape should return verified
select is(
  (
    select result->>'status'
    from pgflow.ensure_flow_compiled(
      'existing_flow',
      '{
        "steps": [
          {"slug": "first", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
          {"slug": "second", "stepType": "single", "dependencies": ["first"], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
        ]
      }'::jsonb
    ) as result
  ),
  'verified',
  'Should return verified status for matching shape'
);

-- Verify differences array is empty
select is(
  (
    select jsonb_array_length(result->'differences')
    from pgflow.ensure_flow_compiled(
      'existing_flow',
      '{
        "steps": [
          {"slug": "first", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
          {"slug": "second", "stepType": "single", "dependencies": ["first"], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
        ]
      }'::jsonb
    ) as result
  ),
  0,
  'Differences should be empty for matching shape'
);

select finish();
rollback;
