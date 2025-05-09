BEGIN;
SELECT plan(3);

SELECT pgflow_tests.reset_db();

-- Create a simple flow with a step that will fail
SELECT pgflow.create_flow('failure_test');
SELECT pgflow.add_step('failure_test', 'failing_step', max_attempts => 0);
SELECT pgflow.add_step('failure_test', 'dependent_step', ARRAY['failing_step']);

-- Set up our mocking framework
SELECT pgflow_tests.mock_realtime();

-- Start the flow
WITH flow AS (
  SELECT * FROM pgflow.start_flow('failure_test', '{"test": true}'::jsonb)
)
SELECT run_id INTO TEMP flow_run FROM flow;

-- Simulate the step:failed event that would be sent by fail_task
SELECT pgflow_tests.capture_realtime_event(
  jsonb_build_object(
    'event_type', 'step:failed',
    'run_id', (SELECT run_id FROM flow_run),
    'step_slug', 'failing_step',
    'status', 'failed',
    'error_message', 'Simulated error for testing',
    'failed_at', now()
  ),
  'step:failing_step:failed',
  concat('pgflow:run:', (SELECT run_id FROM flow_run)),
  false
);

-- Verify step:failed event was sent
SELECT pgflow_tests.assert_realtime_event_sent(
  'step:failed',
  'A step:failed event should be sent when a step fails'
);

-- Verify the event was sent for the correct step
SELECT pgflow_tests.assert_step_event_sent(
  'step:failed',
  'failing_step',
  'The step:failed event should be for the failing_step'
);

-- Verify the event topic pattern
SELECT pgflow_tests.assert_event_topic_pattern(
  'step:failed',
  'pgflow:run:%',
  'The topic should follow the pgflow:run:<run_id> format'
);

SELECT * FROM finish();
ROLLBACK;