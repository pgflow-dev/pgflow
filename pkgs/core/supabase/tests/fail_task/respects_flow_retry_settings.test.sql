BEGIN;
SELECT plan(5);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_helpers();

-- SETUP: Create a flow with custom retry settings
SELECT pgflow.create_flow('custom_retry', 1, 2);
SELECT pgflow.add_step('custom_retry', 'test_step');

-- Start the flow
SELECT pgflow.start_flow('custom_retry', '{"test": true}'::JSONB);

-- Fail the task first time
SELECT poll_and_fail('custom_retry');

-- TEST: The task should be queued (first retry)
SELECT is(
  (SELECT status FROM pgflow.step_tasks
   WHERE run_id = (SELECT run_id FROM pgflow.runs WHERE flow_slug = 'custom_retry')
   AND step_slug = 'test_step'),
  'queued',
  'Task should be queued after first failure (1st retry of 2)'
);

-- TEST: The retry count should be 1
SELECT is(
  (SELECT retry_count FROM pgflow.step_tasks
   WHERE run_id = (SELECT run_id FROM pgflow.runs WHERE flow_slug = 'custom_retry')
   AND step_slug = 'test_step'),
  1,
  'Retry count should be 1 after first failure'
);

-- Fail the task second time
SELECT pg_sleep(2.1); -- wait for vt to pass
SELECT poll_and_fail('custom_retry');

-- TEST: The task should be queued (second retry)
SELECT is(
  (SELECT status FROM pgflow.step_tasks
   WHERE run_id = (SELECT run_id FROM pgflow.runs WHERE flow_slug = 'custom_retry')
   AND step_slug = 'test_step'),
  'queued',
  'Task should be queued after second failure (2nd retry of 2)'
);

-- Fail the task third time
SELECT pg_sleep(2.1); -- wait for vt to pass
SELECT poll_and_fail('custom_retry');

-- TEST: The task should be failed (exceeded retry limit)
SELECT is(
  (SELECT status FROM pgflow.step_tasks
   WHERE run_id = (SELECT run_id FROM pgflow.runs WHERE flow_slug = 'custom_retry')
   AND step_slug = 'test_step'),
  'failed',
  'Task should be failed after third failure (exceeded retry limit of 2)'
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
