begin;
select plan(2);
select pgflow_tests.reset_db();

-- Setup
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'first_step');
select pgflow.create_flow('another_flow');

-- Test
select pgflow.add_step('another_flow', 'first_step');
select pgflow.add_step('another_flow', 'another_step', array['first_step']);
select set_eq(
  $$
      SELECT flow_slug, step_slug
      FROM pgflow.steps WHERE flow_slug = 'another_flow'
    $$,
  $$ VALUES
       ('another_flow', 'another_step'),
       ('another_flow', 'first_step')
    $$,
  'Steps in second flow should be isolated from first flow'
);

-- Test step_index isolation between flows
select set_eq(
  $$
      SELECT flow_slug, step_slug, step_index
      FROM pgflow.steps
      ORDER BY flow_slug, step_index
    $$,
  $$ VALUES
       ('another_flow', 'first_step', 0),
       ('another_flow', 'another_step', 1),
       ('test_flow', 'first_step', 0)
    $$,
  'Step indexes should be isolated between flows'
);

select * from finish();
rollback;
