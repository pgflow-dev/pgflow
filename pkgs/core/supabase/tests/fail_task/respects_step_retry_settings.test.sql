BEGIN;
SELECT plan(3);
SELECT pgflow_tests.reset_db();

-- SETUP: Create a flow with custom retry settings
SELECT pgflow.create_flow('custom_retry', max_attempts => 10, base_delay => 10);
SELECT pgflow.add_step('custom_retry', 'test_step', max_attempts => 2, base_delay => 0);

-- Start the flow
SELECT pgflow.start_flow('custom_retry', '{"test": true}'::JSONB);

-- Fail the task first time
SELECT pgflow_tests.poll_and_fail('custom_retry');

-- TEST: The task should be queued (first retry)
SELECT is(
  (SELECT status FROM pgflow.step_tasks LIMIT 1),
  'queued',
  'Task should be queued after first failure (1st attempt of 2)'
);

-- Fail the task second time
SELECT pgflow_tests.poll_and_fail('custom_retry');

-- TEST: The task should be queued (second retry)
SELECT is(
  (SELECT status FROM pgflow.step_tasks
   WHERE run_id = (SELECT run_id FROM pgflow.runs WHERE flow_slug = 'custom_retry')
   AND step_slug = 'test_step'),
  'failed',
  'Task should be failed after second failure (2nd attempt of 2)'
);

-- TEST: The run should be failed
SELECT is(
  (SELECT status FROM pgflow.runs
   WHERE flow_slug = 'custom_retry'),
  'failed',
  'Run should be failed after exceeding retry limit'
);

SELECT finish();
ROLLBACK;
