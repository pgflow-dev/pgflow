BEGIN;
SELECT plan(5);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('two_roots');

SELECT pgflow.start_flow('two_roots', '"hello"'::jsonb);

-- TEST: A step_task record should be created only for the root step
SELECT is(
    (
        SELECT
            array_agg(
                step_slug
                ORDER BY step_slug
            )
        FROM pgflow.step_tasks
        WHERE flow_slug = 'two_roots'
    ),
    ARRAY['root_a', 'root_b']::text[],
    'A step_task record should be created for each root step'
);

-- TEST: Two messages should be in the queue, one per each root step
SELECT is(
  (SELECT count(*)::int FROM pgmq.q_two_roots),
  2::int,
  'Two messages should be in the queue, one per each root step'
);

-- TEST; Messages have appropriate flow slugs
SELECT is(
  (SELECT DISTINCT message->>'flow_slug' FROM pgmq.q_two_roots),
  'two_roots'::text,
  'Messages have appropriate flow slugs'
);

-- TEST: Messages have appropriate step slugs
SELECT is(
  (SELECT array_agg(message->>'step_slug') FROM pgmq.q_two_roots),
  ARRAY['root_a', 'root_b']::text[],
  'Messages have appropriate step slugs'
);

SELECT is(
  (SELECT array_agg(message->>'run_id') FROM pgmq.q_two_roots),
  (SELECT array_agg(run_id::text) FROM pgflow.step_tasks
   WHERE flow_slug = 'two_roots'),
  'Messages have appropriate run_ids'
);

SELECT finish();
ROLLBACK;
