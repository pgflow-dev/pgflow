begin;
select plan(3);
select pgflow_tests.reset_db();

-- Setup single-step flow with max_attempts = 1 so task fails permanently on first failure
select pgflow.create_flow('single_step', max_attempts => 1);
select pgflow.add_step('single_step', 'only_step');

-- SETUP
select pgflow.start_flow('single_step', '{"test": true}'::JSONB);

-- Ensure worker exists
select pgflow_tests.ensure_worker('single_step');

-- Start the task
select pgflow_tests.read_and_start('single_step');

-- Fail the task first
select pgflow.fail_task(
  (select run_id from pgflow.runs limit 1),
  'only_step',
  0,
  'Task failed for testing'
);

-- Verify task is failed
select is(
  (select status from pgflow.step_tasks where step_slug = 'only_step'),
  'failed',
  'Task should be failed'
);

-- TEST: Try to fail an already failed task
select pgflow.fail_task(
  (select run_id from pgflow.runs limit 1),
  'only_step',
  0,
  'Trying to fail already failed task'
);

-- TEST: Task should still be failed with original error message
select is(
  (select status from pgflow.step_tasks where step_slug = 'only_step'),
  'failed',
  'Task should remain failed'
);

select is(
  (select error_message from pgflow.step_tasks where step_slug = 'only_step'),
  'Task failed for testing',
  'Task should have original error message'
);

select finish();
rollback;