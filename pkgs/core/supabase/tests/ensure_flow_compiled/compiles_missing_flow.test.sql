begin;
select plan(3);
select pgflow_tests.reset_db();

-- Test: Missing flow should be compiled (default production mode)
select is(
  (
    select result->>'status'
    from pgflow.ensure_flow_compiled(
      'new_flow',
      '{
        "steps": [
          {"slug": "first", "stepType": "single", "dependencies": []}
        ]
      }'::jsonb
    ) as result
  ),
  'compiled',
  'Should return compiled status for missing flow'
);

-- Verify flow was actually created
select is(
  (select count(*)::int from pgflow.flows where flow_slug = 'new_flow'),
  1,
  'Flow should be created in database'
);

select is(
  (select count(*)::int from pgflow.steps where flow_slug = 'new_flow'),
  1,
  'Step should be created in database'
);

select finish();
rollback;
