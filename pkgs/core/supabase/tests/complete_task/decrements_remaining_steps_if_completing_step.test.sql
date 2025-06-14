begin;
select plan(4);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- Start the flow
select pgflow.start_flow('sequential', '{"test": true}'::JSONB);

-- Ensure worker exists
select pgflow_tests.ensure_worker('sequential');

-- TEST: Initial remaining_steps should be 3
select is(
  (select remaining_steps::INT from pgflow.runs limit 1),
  3::INT,
  'Initial remaining_steps should be 3'
);

-- Start and complete the first step's task
with task as (
  select * from pgflow_tests.read_and_start('sequential') limit 1
)
select pgflow.complete_task(
  task.run_id,
  task.step_slug,
  0,
  '{"result": "success"}'::JSONB
) from task;

-- TEST: After completing first step, remaining_steps should be 2
select is(
  (select remaining_steps::INT from pgflow.runs limit 1),
  2::INT,
  'After completing first step, remaining_steps should be 2'
);

-- Start and complete the second step's task
with task as (
  select * from pgflow_tests.read_and_start('sequential') limit 1
)
select pgflow.complete_task(
  task.run_id,
  task.step_slug,
  0,
  '{"result": "success"}'::JSONB
) from task;

-- TEST: After completing second step, remaining_steps should be 1
select is(
  (select remaining_steps::INT from pgflow.runs limit 1),
  1::INT,
  'After completing second step, remaining_steps should be 1'
);

-- Start and complete the last step's task
with task as (
  select * from pgflow_tests.read_and_start('sequential') limit 1
)
select pgflow.complete_task(
  task.run_id,
  task.step_slug,
  0,
  '{"result": "success"}'::JSONB
) from task;

-- TEST: Final remaining_steps should be 0
select is(
  (select remaining_steps::INT from pgflow.runs limit 1),
  0::INT,
  'Final remaining_steps should be 0'
);

select finish();
rollback;
