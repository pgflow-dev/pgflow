begin;
select plan(3);
select pgflow_tests.reset_db();

-- Setup
select pgflow.create_flow('test_flow');

-- Test
select pgflow.add_step('test_flow', 'first_step');
select results_eq(
  $$ SELECT step_slug FROM pgflow.steps WHERE flow_slug = 'test_flow' $$,
  array['first_step']::text [],
  'Step should be added to the steps table'
);
select is_empty(
  $$ SELECT * FROM pgflow.deps WHERE flow_slug = 'test_flow' $$,
  'No dependencies should be added for step with no dependencies'
);
select is(
  (
    select deps_count::int from pgflow.steps
    where flow_slug = 'test_flow'
  ),
  0::int,
  'deps_count should be 0 because there are no dependencies'
);

select * from finish();
rollback;
