begin;
select plan(3);
select pgflow_tests.reset_db();

-- Setup: Create flow with different shape
select pgflow.create_flow('dev_flow');
select pgflow.add_step('dev_flow', 'old_step');

-- Test: Different shape in development mode should recompile
select is(
  (
    select result->>'status'
    from pgflow.ensure_flow_compiled(
      'dev_flow',
      '{
        "steps": [
          {"slug": "new_step", "stepType": "single", "dependencies": []}
        ]
      }'::jsonb,
      'development'
    ) as result
  ),
  'recompiled',
  'Should return recompiled status in development mode'
);

-- Verify old step is gone
select is(
  (select count(*)::int from pgflow.steps where flow_slug = 'dev_flow' and step_slug = 'old_step'),
  0,
  'Old step should be deleted'
);

-- Verify new step exists
select is(
  (select count(*)::int from pgflow.steps where flow_slug = 'dev_flow' and step_slug = 'new_step'),
  1,
  'New step should be created'
);

select finish();
rollback;
