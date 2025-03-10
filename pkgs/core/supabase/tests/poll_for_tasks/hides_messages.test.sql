BEGIN;
SELECT * FROM plan(2);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run which will put a single task in the queue
SELECT pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST: Poll a single task with big visibility timeout (vt = 10)
WITH messages AS (
  SELECT
      pgflow.poll_for_tasks(
          queue_name => 'sequential'::text,
          vt => 2,
          qty => 1,
          max_poll_seconds => 1
      )
)

SELECT is(
  (SELECT count(*)::integer FROM messages),
  1::integer,
  'Read a single message'
);

-- TEST: Polling again yields no messages becuase of vt = 10 in previous poll
WITH messages AS (
  SELECT
      pgflow.poll_for_tasks(
          queue_name => 'sequential'::text,
          vt => 2,
          qty => 1,
          max_poll_seconds => 1
      )
)

SELECT is(
  (SELECT count(*)::integer FROM messages),
  0::integer,
  'Read no messages because the message is still hidden'
);

SELECT * FROM finish();
ROLLBACK;
