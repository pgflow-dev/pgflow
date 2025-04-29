begin;
select plan(3);
select pgflow_tests.reset_db();

-- Setup
select pgflow.create_flow('test_flow');

-- Test: First step should have index 0
select pgflow.add_step('test_flow', 'first_step');
select is(
  (select step_index from pgflow.steps where flow_slug = 'test_flow' and step_slug = 'first_step'),
  0,
  'First step should have index 0'
);

-- Test: Second step should have index 1
select pgflow.add_step('test_flow', 'second_step');
select is(
  (select step_index from pgflow.steps where flow_slug = 'test_flow' and step_slug = 'second_step'),
  1,
  'Second step should have index 1'
);

-- Test: Third step should have index 2
select pgflow.add_step('test_flow', 'third_step');
select is(
  (select step_index from pgflow.steps where flow_slug = 'test_flow' and step_slug = 'third_step'),
  2,
  'Third step should have index 2'
);

select * from finish();
rollback;
