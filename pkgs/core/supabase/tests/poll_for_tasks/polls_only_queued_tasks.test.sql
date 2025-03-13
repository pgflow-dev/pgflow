BEGIN;
SELECT plan(1);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');

-- This is a regression test for a bug that was showing up when messages
-- were not archived properly after being completed
-- It manifested as completed tasks being updated to 'started'

-- SETUP: Start a flow, poll and complete the first task
SELECT pgflow.start_flow('sequential', '"hello"'::jsonb);
SELECT pgflow.poll_for_tasks('sequential'::text, 0, 1);
SELECT pgflow.complete_task(
  (SELECT run_id FROM pgflow.runs WHERE flow_slug = 'sequential' ORDER BY run_id LIMIT 1),
  'first',
  0,
  '"first completed"'::jsonb
);
SELECT pgflow.poll_for_tasks('sequential'::text, 0, 1);

-- TEST: Already completed tasks should not be changed
SELECT is(
  (SELECT status FROM pgflow.step_tasks WHERE step_slug = 'first'),
  'completed',
  'Already completed task should not be changed'
);

SELECT finish();
ROLLBACK;

