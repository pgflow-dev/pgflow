BEGIN;
SELECT * FROM plan(1);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run which will put a task in the queue
WITH flow_run AS (
  SELECT * FROM pgflow.start_flow('sequential', '{"id": 1}'::jsonb)
)

-- Manually delete a step_task but keep the message in the queue
-- This simulates an inconsistent state where a message exists
-- but there's no corresponding step_task
DELETE FROM pgflow.step_tasks
WHERE
    run_id = (SELECT run_id FROM pgflow.runs
WHERE flow_slug = 'sequential' LIMIT 1)
AND step_slug = 'first';

-- TEST: Polling should not return tasks for missing step_tasks
-- even though messages might exist in the queue
SELECT is(
  (SELECT count(*)::integer FROM pgflow.poll_for_tasks(
    queue_name => 'sequential'::text,
    vt => 5,
    qty => 1,
    max_poll_seconds => 1
  )),
  0::integer,
  'Should not return tasks when step_tasks row is missing'
);

SELECT * FROM finish();
ROLLBACK;
