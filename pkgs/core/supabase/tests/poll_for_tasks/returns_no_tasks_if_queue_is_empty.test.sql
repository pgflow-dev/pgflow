BEGIN;
SELECT * FROM plan(1);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');

-- TEST: Polling from an empty queue returns no tasks
SELECT is(
  (SELECT count(*)::integer FROM pgflow.poll_for_tasks(
    queue_name => 'sequential'::text,
    vt => 5,
    qty => 10,
    max_poll_seconds => 1
  )),
  0::integer,
  'Should return no tasks when queue is empty'
);

SELECT * FROM finish();
ROLLBACK;
