begin;
select plan(4);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- Start the flow
select pgflow.start_flow('sequential', '{"test": true}'::JSONB);

-- TEST: Initial remaining_steps should be 3
select is(
  (select remaining_steps::INT from pgflow.runs limit 1),
  3::INT,
  'Initial remaining_steps should be 3'
);

-- Complete the first step's task
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'first',
  0,
  '{"result": "success"}'::JSONB
);

-- TEST: After completing first step, remaining_steps should be 2
select is(
  (select remaining_steps::INT from pgflow.runs limit 1),
  2::INT,
  'After completing first step, remaining_steps should be 2'
);

-- Complete the second step's task
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'second',
  0,
  '{"result": "success"}'::JSONB
);

-- TEST: After completing second step, remaining_steps should be 1
select is(
  (select remaining_steps::INT from pgflow.runs limit 1),
  1::INT,
  'After completing second step, remaining_steps should be 1'
);

-- Complete the last step's task
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'last',
  0,
  '{"result": "success"}'::JSONB
);

-- TEST: Final remaining_steps should be 0
select is(
  (select remaining_steps::INT from pgflow.runs limit 1),
  0::INT,
  'Final remaining_steps should be 0'
);

select finish();
rollback;
