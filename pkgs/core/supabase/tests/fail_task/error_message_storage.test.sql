BEGIN;
SELECT plan(3);

SELECT pgflow_tests.reset_db();

-- Create flow with max_attempts=0 to ensure immediate failure
SELECT pgflow.create_flow('error_test');
SELECT pgflow.add_step('error_test', 'first', max_attempts => 0);
SELECT pgflow.add_step('error_test', 'second', ARRAY['first']);

-- Start a flow
SELECT pgflow.start_flow('error_test', '{}'::jsonb);

-- Use the helper function to poll and fail a task with a custom error message
SELECT pgflow_tests.poll_and_fail('error_test');

-- Check error_message in step_tasks
SELECT is(
  (SELECT error_message FROM pgflow.step_tasks WHERE flow_slug = 'error_test' AND step_slug = 'first' LIMIT 1),
  'first FAILED',
  'Error message should be stored in step_tasks'
);

-- Check error_message in step_states
SELECT is(
  (SELECT error_message FROM pgflow.step_states WHERE flow_slug = 'error_test' AND step_slug = 'first' LIMIT 1),
  'first FAILED',
  'Error message should be stored in step_states'
);

-- Check that dependent steps don't have error messages
SELECT is(
  (SELECT error_message FROM pgflow.step_states WHERE flow_slug = 'error_test' AND step_slug = 'second' LIMIT 1),
  NULL,
  'Dependent steps should not have error messages'
);

SELECT * FROM finish();
ROLLBACK;