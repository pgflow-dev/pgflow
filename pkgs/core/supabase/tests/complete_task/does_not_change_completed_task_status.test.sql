begin;
select plan(2);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- SETUP
select pgflow.start_flow('sequential', '{"test": true}'::JSONB);

-- Ensure worker exists
select pgflow_tests.ensure_worker('sequential');

-- Start and complete the task first
select pgflow_tests.read_and_start('sequential');
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'first',
  0,
  '"first was successful"'::JSONB
);

-- Verify task is completed
select is(
  (select status from pgflow.step_tasks where step_slug = 'first'),
  'completed',
  'Task should be completed'
);

-- TEST: Try to complete an already completed task
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'first',
  0,
  '"trying to complete again"'::JSONB
);

-- TEST: Task should still be completed with original output
select is(
  (select output from pgflow.step_tasks where step_slug = 'first'),
  '"first was successful"'::JSONB,
  'Task should remain completed with original output'
);

select finish();
rollback;