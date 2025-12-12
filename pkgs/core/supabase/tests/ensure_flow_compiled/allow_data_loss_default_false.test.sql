begin;
select plan(3);
select pgflow_tests.reset_db();

-- Setup: Simulate production environment (not local)
select set_config('app.settings.jwt_secret', 'production-jwt-secret-that-differs-from-local', true);

-- Setup: Create flow with different shape
select pgflow.create_flow('default_loss_flow');
select pgflow.add_step('default_loss_flow', 'old_step');

-- Test: Different shape should return mismatch when allow_data_loss defaults to false
select is(
  (
    select result->>'status'
    from pgflow.ensure_flow_compiled(
      'default_loss_flow',
      '{
        "steps": [
          {"slug": "new_step", "stepType": "single", "dependencies": []}
        ]
      }'::jsonb,
      false  -- allow_data_loss = false (explicit)
    ) as result
  ),
  'mismatch',
  'Should return mismatch when allow_data_loss=false in production'
);

-- Verify differences are returned
select ok(
  (
    select jsonb_array_length(result->'differences') > 0
    from pgflow.ensure_flow_compiled(
      'default_loss_flow',
      '{
        "steps": [
          {"slug": "new_step", "stepType": "single", "dependencies": []}
        ]
      }'::jsonb,
      false
    ) as result
  ),
  'Should return differences when allow_data_loss=false'
);

-- Verify database was NOT modified
select is(
  (select step_slug from pgflow.steps where flow_slug = 'default_loss_flow'),
  'old_step',
  'Database should not be modified when allow_data_loss=false'
);

select finish();
rollback;
