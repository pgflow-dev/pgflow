begin;
select plan(4);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- Start the flow
select pgflow.start_flow('sequential', '{"test": true}'::JSONB);

-- Ensure worker exists
select pgflow_tests.ensure_worker('sequential');

-- TEST: Initial remaining_steps should be 3 and status should be 'started'
select results_eq(
  $$ SELECT remaining_steps::int, status FROM pgflow.runs LIMIT 1 $$,
  $$ VALUES (3::int, 'started'::text) $$,
  'Initial remaining_steps should be 3 and status should be started'
);

-- Start and complete the first step's task
with task as (
  select * from pgflow_tests.read_and_start('sequential') limit 1
)
select pgflow.complete_task(
  task.run_id,
  task.step_slug,
  0,
  '"first was successful"'::JSONB
) from task;

-- TEST: After completing first step, remaining_steps should be 2 and status still 'started'
select results_eq(
  $$ SELECT remaining_steps::int, status FROM pgflow.runs LIMIT 1 $$,
  $$ VALUES (2::int, 'started'::text) $$,
  'After completing first step, remaining_steps should be 2 and status still started'
);

-- Start and complete the second step's task
with task as (
  select * from pgflow_tests.read_and_start('sequential') limit 1
)
select pgflow.complete_task(
  task.run_id,
  task.step_slug,
  0,
  '"second was successful"'::JSONB
) from task;

-- TEST: After completing second step, remaining_steps should be 1 and status still 'started'
select results_eq(
  $$ SELECT remaining_steps::int, status FROM pgflow.runs LIMIT 1 $$,
  $$ VALUES (1::int, 'started'::text) $$,
  'After completing second step, remaining_steps should be 1 and status still started'
);

-- Start and complete the last step's task
with task as (
  select * from pgflow_tests.read_and_start('sequential') limit 1
)
select pgflow.complete_task(
  task.run_id,
  task.step_slug,
  0,
  '"last was successful"'::JSONB
) from task;

-- TEST: Final remaining_steps should be 0 and status should be 'completed'
select results_eq(
  $$ SELECT remaining_steps::int, status FROM pgflow.runs LIMIT 1 $$,
  $$ VALUES (0::int, 'completed'::text) $$,
  'Final remaining_steps should be 0 and status should be completed'
);

select finish();
rollback;
