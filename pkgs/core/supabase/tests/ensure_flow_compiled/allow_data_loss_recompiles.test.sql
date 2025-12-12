begin;
select plan(3);
select pgflow_tests.reset_db();

-- Setup: Simulate production environment (not local)
select set_config('app.settings.jwt_secret', 'production-jwt-secret-that-differs-from-local', true);

-- Setup: Create flow with different shape
select pgflow.create_flow('allow_loss_flow');
select pgflow.add_step('allow_loss_flow', 'old_step');

-- Test: Different shape should recompile when allow_data_loss=true even when is_local()=false
select is(
  (
    select result->>'status'
    from pgflow.ensure_flow_compiled(
      'allow_loss_flow',
      '{
        "steps": [
          {"slug": "new_step", "stepType": "single", "dependencies": []}
        ]
      }'::jsonb,
      true  -- allow_data_loss = true
    ) as result
  ),
  'recompiled',
  'Should recompile when allow_data_loss=true even in production'
);

-- Verify old step is gone
select is(
  (select count(*)::int from pgflow.steps where flow_slug = 'allow_loss_flow' and step_slug = 'old_step'),
  0,
  'Old step should be deleted when allow_data_loss=true'
);

-- Verify new step exists
select is(
  (select count(*)::int from pgflow.steps where flow_slug = 'allow_loss_flow' and step_slug = 'new_step'),
  1,
  'New step should be created when allow_data_loss=true'
);

select finish();
rollback;
