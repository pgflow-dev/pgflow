begin;
select plan(1);
select pgflow_tests.reset_db();

-- Test: Nonexistent flow should return empty steps array
select is(
  pgflow._get_flow_shape('nonexistent'),
  '{"steps": []}'::jsonb,
  'Should return empty steps for nonexistent flow'
);

select finish();
rollback;
