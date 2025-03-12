BEGIN;
SELECT plan(5);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');

-- SETUP
SELECT pgflow.start_flow('sequential', '{"test": true}'::JSONB);

-- TEST: First message shoud be in the queue
SELECT is(
  (SELECT message->>'step_slug' FROM pgmq.q_sequential LIMIT 1),
  'first',
  'First message should be in the queue'
);

-- SETUP
SELECT pgflow.complete_task(
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'first',
    0,
    '"first was successful"'::JSONB
);

-- TEST: First message shoud be archived
SELECT is(
  (SELECT count(*)::int FROM pgmq.q_sequential WHERE message->>'step_slug' = 'first'),
  0::int,
  'There should be no messages in the queue'
);
SELECT is(
  (SELECT count(*)::int FROM pgmq.a_sequential WHERE message->>'step_slug' = 'first' LIMIT 1),
  1::int,
  'The message should be archived'
);

-- TEST: Other messages shoud not be archived
SELECT is(
  (SELECT count(*)::int FROM pgmq.q_sequential WHERE message->>'step_slug' = 'second'),
  1::int,
  'There should be no messages in the queue'
);
SELECT is(
  (SELECT count(*)::int FROM pgmq.a_sequential WHERE message->>'step_slug' = 'second' LIMIT 1),
  0::int,
  'The other message should not be archived'
);

SELECT finish();
ROLLBACK;
