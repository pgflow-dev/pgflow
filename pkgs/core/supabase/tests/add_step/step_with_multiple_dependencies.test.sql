begin;
select plan(4);
select pgflow_tests.reset_db();

-- Setup
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'first_step');
select pgflow.add_step('test_flow', 'second_step', array['first_step']);

-- Test
select pgflow.add_step('test_flow', 'third_step', array['second_step']);
select
  pgflow.add_step('test_flow', 'fourth_step', array['second_step', 'third_step']);
select results_eq(
  $$
      SELECT step_slug FROM pgflow.steps WHERE flow_slug = 'test_flow' ORDER BY step_slug
    $$,
  array['first_step', 'fourth_step', 'second_step', 'third_step']::text [],
  'All steps should be in the steps table'
);
select is(
  (
    select deps_count::int
    from pgflow.steps
    where flow_slug = 'test_flow' and step_slug = 'fourth_step'
  ),
  2::int,
  'deps_count should be 2 because "fourth_step" have two dependencies'
);
select set_eq(
  $$
      SELECT dep_slug, step_slug
      FROM pgflow.deps
      WHERE flow_slug = 'test_flow'
    $$,
  $$ VALUES
       ('first_step', 'second_step'),
       ('second_step', 'third_step'),
       ('second_step', 'fourth_step'),
       ('third_step', 'fourth_step')
    $$,
  'All dependencies should be correctly recorded'
);

-- Test step indexes are assigned in order of addition
select results_eq(
  $$
      SELECT step_slug, step_index
      FROM pgflow.steps
      WHERE flow_slug = 'test_flow'
      ORDER BY step_index
    $$,
  $$ VALUES
       ('first_step', 0),
       ('second_step', 1),
       ('third_step', 2),
       ('fourth_step', 3)
    $$,
  'Step indexes should be assigned in order of addition'
);

select * from finish();
rollback;
