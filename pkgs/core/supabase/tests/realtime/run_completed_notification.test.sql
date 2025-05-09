BEGIN;
SELECT plan(3);

SELECT pgflow_tests.reset_db();

-- Create a simple flow with just one step
SELECT pgflow.create_flow('simple_flow');
SELECT pgflow.add_step('simple_flow', 'only_step');

-- Set up our mocking framework
SELECT pgflow_tests.mock_realtime();

-- Start a flow
WITH flow AS (
  SELECT * FROM pgflow.start_flow('simple_flow', '{"test": true}'::jsonb)
)
SELECT run_id INTO TEMP flow_run FROM flow;

-- Simulate the run:completed event that would be sent by maybe_complete_run
SELECT pgflow_tests.capture_realtime_event(
  jsonb_build_object(
    'event_type', 'run:completed',
    'run_id', (SELECT run_id FROM flow_run),
    'flow_slug', 'simple_flow',
    'status', 'completed',
    'output', jsonb_build_object('only_step', jsonb_build_object('test', true)),
    'completed_at', now()
  ),
  'run:completed',
  concat('pgflow:run:', (SELECT run_id FROM flow_run)),
  false
);

-- Verify run:completed event was sent
SELECT pgflow_tests.assert_realtime_event_sent(
  'run:completed',
  'A run:completed event should be sent when a run is completed'
);

-- Verify the event was sent for the correct flow
SELECT pgflow_tests.assert_run_event_sent(
  'run:completed',
  'simple_flow',
  'The run:completed event should be for the simple_flow'
);

-- Verify the event topic pattern
SELECT pgflow_tests.assert_event_topic_pattern(
  'run:completed',
  'pgflow:run:%',
  'The topic should follow the pgflow:run:<run_id> format'
);

SELECT * FROM finish();
ROLLBACK;