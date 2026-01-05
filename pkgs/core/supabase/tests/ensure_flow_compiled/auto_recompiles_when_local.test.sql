begin;
select plan(3);
select pgflow_tests.reset_db();

-- Setup: Simulate local environment
select set_config('app.settings.jwt_secret', 'super-secret-jwt-token-with-at-least-32-characters-long', true);

-- Setup: Create flow with different shape
select pgflow.create_flow('local_flow');
select pgflow.add_step('local_flow', 'old_step');

-- Test: Different shape should auto-recompile when is_local()=true (no p_mode param)
select is(
  (
    select result->>'status'
    from pgflow.ensure_flow_compiled(
      'local_flow',
      '{
        "steps": [
          {"slug": "new_step", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenFailed": "fail"}
        ]
      }'::jsonb
    ) as result
  ),
  'recompiled',
  'Should auto-recompile when is_local()=true'
);

-- Verify old step is gone
select is(
  (select count(*)::int from pgflow.steps where flow_slug = 'local_flow' and step_slug = 'old_step'),
  0,
  'Old step should be deleted'
);

-- Verify new step exists
select is(
  (select count(*)::int from pgflow.steps where flow_slug = 'local_flow' and step_slug = 'new_step'),
  1,
  'New step should be created'
);

select finish();
rollback;
