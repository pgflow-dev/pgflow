begin;
select plan(3);
select pgflow_tests.reset_db();

-- Setup: Create flow with different shape
select pgflow.create_flow('prod_flow');
select pgflow.add_step('prod_flow', 'old_step');

-- Test: Different shape in production mode should return mismatch
select is(
  (
    select result->>'status'
    from pgflow.ensure_flow_compiled(
      'prod_flow',
      '{
        "steps": [
          {"slug": "new_step", "stepType": "single", "dependencies": []}
        ]
      }'::jsonb,
      'production'
    ) as result
  ),
  'mismatch',
  'Should return mismatch status in production mode'
);

-- Verify differences are returned
select ok(
  (
    select jsonb_array_length(result->'differences') > 0
    from pgflow.ensure_flow_compiled(
      'prod_flow',
      '{
        "steps": [
          {"slug": "new_step", "stepType": "single", "dependencies": []}
        ]
      }'::jsonb,
      'production'
    ) as result
  ),
  'Should return differences for production mismatch'
);

-- Verify database was NOT modified
select is(
  (select step_slug from pgflow.steps where flow_slug = 'prod_flow'),
  'old_step',
  'Database should not be modified on production mismatch'
);

select finish();
rollback;
