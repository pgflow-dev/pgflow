BEGIN;
SELECT plan(1);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_helpers();

-- Create a test flow with two steps that have different base delays
SELECT pgflow.create_flow('backoff_test');
SELECT pgflow.add_step('backoff_test', 'first', max_attempts => 3, base_delay => 1);
SELECT pgflow.add_step('backoff_test', 'last', max_attempts => 3, base_delay => 2);

-- Start the flow with test data
SELECT pgflow.start_flow('backoff_test', '{"test": true}'::JSONB);

-- Simulate a task failure
SELECT pgflow_tests.poll_and_fail('backoff_test', 1, 1);

-- Test that exponential backoff is working correctly
WITH 
  -- Get the task's visible time and when it was originally enqueued
  message_timing AS (
    SELECT vt, enqueued_at 
    FROM pgmq.q_backoff_test
    JOIN pgflow.step_tasks st ON st.message_id = msg_id
    WHERE st.step_slug = 'first'
  ),
  -- Calculate the actual delay in seconds
  actual_delay AS (
    SELECT EXTRACT(EPOCH FROM (vt - enqueued_at)) AS delay_seconds
    FROM message_timing
  ),
  -- Get the configured base delay for this step
  expected_delay AS (
    SELECT opt_base_delay AS base_delay 
    FROM pgflow.steps 
    WHERE flow_slug = 'backoff_test' AND step_slug = 'first'
  )
-- Verify the delay is at least the base delay (2^0 * base_delay)
SELECT is(
  ((select delay_seconds from actual_delay) > (SELECT base_delay FROM expected_delay)),
  true,
  'First step task should have visible time set to at least 1 second delay (2^0 * 1)'
);

SELECT finish();
ROLLBACK;
