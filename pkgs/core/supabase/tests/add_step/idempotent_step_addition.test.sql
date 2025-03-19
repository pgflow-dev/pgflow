begin;
select plan(1);
select pgflow_tests.reset_db();

-- Setup
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'first_step');

-- Test
select pgflow.add_step('test_flow', 'first_step');
select results_eq(
  $$
      SELECT count(*)::int FROM pgflow.steps WHERE flow_slug = 'test_flow' AND step_slug = 'first_step'
    $$,
  array[1]::int [],
  'Calling add_step again for same step does not create a duplicate'
);

select * from finish();
rollback;
