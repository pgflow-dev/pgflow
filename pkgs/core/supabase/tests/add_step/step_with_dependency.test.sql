begin;
select plan(3);
select pgflow_tests.reset_db();

-- Setup
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'first_step');

-- Test
select pgflow.add_step('test_flow', 'second_step', array['first_step']);
select results_eq(
  $$ SELECT step_slug FROM pgflow.steps WHERE flow_slug = 'test_flow' ORDER BY step_slug $$,
  array['first_step', 'second_step']::text [],
  'Second step should be added to the steps table'
);
select is(
  (
    select deps_count::int
    from pgflow.steps
    where flow_slug = 'test_flow' and step_slug = 'second_step'
  ),
  1::int,
  'deps_count should be 1 because "second_step" has one dependency'
);
select results_eq(
  $$
      SELECT dep_slug, step_slug
      FROM pgflow.deps WHERE flow_slug = 'test_flow'
      ORDER BY dep_slug, step_slug
    $$,
  $$ VALUES ('first_step', 'second_step') $$,
  'Dependency should be recorded in deps table'
);

select * from finish();
rollback;
