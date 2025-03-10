BEGIN;
SELECT * FROM plan(2);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');

-- SETUP: Start multiple flow runs which will put multiple tasks in the queue
SELECT pgflow.start_flow('sequential', '{"id": 1}'::jsonb);
SELECT pgflow.start_flow('sequential', '{"id": 2}'::jsonb);
SELECT pgflow.start_flow('sequential', '{"id": 3}'::jsonb);

-- TEST: Poll multiple tasks at once (qty = 3)
SELECT is(
  (SELECT count(*)::integer FROM pgflow.poll_for_tasks(
    queue_name => 'sequential'::text,
    vt => 5,
    qty => 3,
    max_poll_seconds => 1
  )),
  3::integer,
  'Should return 3 tasks when qty=3 and 3 tasks are available'
);

-- TEST: Verify all polled tasks have status updated to 'started'
SELECT is(
  (SELECT count(*)::integer FROM pgflow.step_tasks
WHERE status = 'started'),
  3::integer,
  'Should update all 3 polled tasks to status=started'
);

SELECT * FROM finish();
ROLLBACK;
