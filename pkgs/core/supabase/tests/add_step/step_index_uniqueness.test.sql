begin;
select plan(2);
select pgflow_tests.reset_db();

-- Setup
select pgflow.create_flow('test_flow');
select pgflow.create_flow('another_flow');

-- Test: Steps in different flows can have the same index
select pgflow.add_step('test_flow', 'first_step');
select pgflow.add_step('another_flow', 'first_step');

select is(
  (select step_index from pgflow.steps where flow_slug = 'test_flow' and step_slug = 'first_step'),
  (select step_index from pgflow.steps where flow_slug = 'another_flow' and step_slug = 'first_step'),
  'Steps in different flows can have the same index'
);

-- Test: Cannot have two steps with the same index in the same flow
select throws_ok(
  $$ 
  INSERT INTO pgflow.steps (flow_slug, step_slug, step_index) 
  VALUES ('test_flow', 'duplicate_index_step', 0)
  $$,
  '23505', -- Unique violation error code
  'duplicate key value violates unique constraint "steps_flow_slug_step_index_key"',
  'Cannot have two steps with the same index in the same flow'
);

select * from finish();
rollback;
