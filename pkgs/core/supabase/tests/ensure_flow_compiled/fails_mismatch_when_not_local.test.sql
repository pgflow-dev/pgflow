begin;
select plan(3);
select pgflow_tests.reset_db();

-- Setup: Simulate production environment (not local)
select set_config('app.settings.jwt_secret', 'production-jwt-secret-that-differs-from-local', true);

-- Setup: Create flow with different shape
select pgflow.create_flow('prod_flow_auto');
select pgflow.add_step('prod_flow_auto', 'old_step');

-- Test: Different shape should return mismatch when is_local()=false (no p_mode param)
select is(
  (
    select result->>'status'
    from pgflow.ensure_flow_compiled(
      'prod_flow_auto',
      '{
        "steps": [
          {"slug": "new_step", "stepType": "single", "dependencies": []}
        ]
      }'::jsonb
    ) as result
  ),
  'mismatch',
  'Should return mismatch status when is_local()=false'
);

-- Verify differences are returned
select ok(
  (
    select jsonb_array_length(result->'differences') > 0
    from pgflow.ensure_flow_compiled(
      'prod_flow_auto',
      '{
        "steps": [
          {"slug": "new_step", "stepType": "single", "dependencies": []}
        ]
      }'::jsonb
    ) as result
  ),
  'Should return differences for production mismatch'
);

-- Verify database was NOT modified
select is(
  (select step_slug from pgflow.steps where flow_slug = 'prod_flow_auto'),
  'old_step',
  'Database should not be modified on production mismatch'
);

select finish();
rollback;
