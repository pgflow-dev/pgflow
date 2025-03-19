begin;
select plan(3);
select pgflow_tests.reset_db();

-- SETUP: Create a flow with custom retry settings
select pgflow.create_flow('custom_retry', max_attempts => 2, base_delay => 0);
select pgflow.add_step('custom_retry', 'test_step');

-- Start the flow
select pgflow.start_flow('custom_retry', '{"test": true}'::JSONB);

-- Fail the task first time
select pgflow_tests.poll_and_fail('custom_retry');

-- TEST: The task should be queued (first retry)
select is(
  (select status from pgflow.step_tasks limit 1),
  'queued',
  'Task should be queued after first failure (1st attempt of 2)'
);

-- Fail the task second time
select pgflow_tests.poll_and_fail('custom_retry');

-- TEST: The task should be queued (second retry)
select is(
  (
    select status from pgflow.step_tasks
    where
      run_id = (select run_id from pgflow.runs where flow_slug = 'custom_retry')
      and step_slug = 'test_step'
  ),
  'failed',
  'Task should be failed after second failure (2nd attempt of 2)'
);

-- TEST: The run should be failed
select is(
  (
    select status from pgflow.runs
    where flow_slug = 'custom_retry'
  ),
  'failed',
  'Run should be failed after exceeding retry limit'
);

select finish();
rollback;
