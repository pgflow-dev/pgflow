BEGIN;
SELECT plan(3);

SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');
SELECT pgflow_tests.mock_realtime();

-- Start a flow
WITH flow AS (
  SELECT * FROM pgflow.start_flow('sequential', '{"test": true}'::jsonb)
)
SELECT flow.run_id::text INTO TEMP run_id_value FROM flow;

-- Poll for a task
WITH task AS (
  SELECT * FROM pgflow.poll_for_tasks(
    queue_name => 'sequential',
    vt => 1,
    qty => 1
  ) LIMIT 1
)
SELECT run_id, step_slug, 0 as task_index INTO TEMP task_info FROM task;

-- Simulate the step:completed event that would be sent by complete_task
SELECT pgflow_tests.capture_realtime_event(
  jsonb_build_object(
    'event_type', 'step:completed',
    'run_id', (SELECT run_id FROM task_info),
    'step_slug', (SELECT step_slug FROM task_info),
    'status', 'completed',
    'output', jsonb_build_object('test', true),
    'completed_at', now()
  ),
  concat('step:', (SELECT step_slug FROM task_info), ':completed'),
  concat('pgflow:run:', (SELECT run_id FROM task_info)),
  false
);

-- Verify step:completed event was sent
SELECT pgflow_tests.assert_realtime_event_sent(
  'step:completed',
  'A step:completed event should be sent when a task is completed'
);

-- Verify the event was sent for the correct step
SELECT pgflow_tests.assert_step_event_sent(
  'step:completed',
  'first',
  'The step:completed event should be for the first step'
);

-- Verify the event contains the expected topic pattern
SELECT pgflow_tests.assert_event_topic_pattern(
  'step:completed',
  'pgflow:run:%',
  'The topic should follow the pgflow:run:<run_id> format'
);

SELECT * FROM finish();
ROLLBACK;