begin;
select plan(2);
select pgflow_tests.reset_db();

-- Setup: Create a sequential flow with single steps
select pgflow_tests.setup_flow('sequential');

-- Start the flow
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- Ensure worker exists
select pgflow_tests.ensure_worker('sequential');

-- Start and complete the first step with an output
with task as (
  select * from pgflow_tests.read_and_start('sequential') limit 1
)
select pgflow.complete_task(
  task.run_id,
  task.step_slug,
  0,
  '{"result": "first_output"}'::jsonb
) from task;

-- Test 1: The step_state should have the output stored
select is(
  (select output from pgflow.step_states where step_slug = 'first'),
  '{"result": "first_output"}'::jsonb,
  'Single step should store task output directly in step_states.output'
);

-- Test 2: Verify the step is completed
select is(
  (select status from pgflow.step_states where step_slug = 'first'),
  'completed',
  'Step should be marked as completed'
);

select * from finish();
rollback;
