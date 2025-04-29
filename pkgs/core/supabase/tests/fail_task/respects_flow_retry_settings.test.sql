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

-- TEST: The task should be failed after second failure with proper timestamps
select results_eq(
  $$ SELECT status,
        failed_at IS NOT NULL AS has_failed_at,
        completed_at IS NULL AS has_no_completed_at,
        queued_at < failed_at AS failed_after_queued
     FROM pgflow.step_tasks
     WHERE run_id = (SELECT run_id FROM pgflow.runs WHERE flow_slug = 'custom_retry')
     AND step_slug = 'test_step' $$,
  $$ VALUES ('failed', true, true, true) $$,
  'Task should be failed after second failure (2nd attempt of 2) with proper timestamps'
);

-- TEST: The run should be failed with proper timestamps
select results_eq(
  $$ SELECT status,
        failed_at IS NOT NULL AS has_failed_at,
        completed_at IS NULL AS has_no_completed_at,
        started_at < failed_at AS failed_after_started
     FROM pgflow.runs
     WHERE flow_slug = 'custom_retry' $$,
  $$ VALUES ('failed', true, true, true) $$,
  'Run should be failed after exceeding retry limit with proper timestamps'
);

select finish();
rollback;
