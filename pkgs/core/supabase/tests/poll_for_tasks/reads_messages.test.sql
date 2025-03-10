BEGIN;
SELECT plan(4);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run
SELECT pgflow.start_flow('sequential', '"hello"'::jsonb);

WITH
tasks AS (
  SELECT * 
  FROM pgflow.poll_for_tasks(
    queue_name => 'sequential',
    vt => 1,
    qty => 1
  )
  LIMIT 1
)

SELECT is(
  (SELECT count(*)::integer FROM tasks),
  1::integer,
  'Returns worker_task row with correct structure'
)
UNION ALL
SELECT is(
  (SELECT flow_slug FROM tasks),
  'sequential'::text,
  'Returns proper flow_slug'
)
UNION ALL
SELECT is(
  (SELECT step_slug FROM tasks),
  'first'::text,
  'Returns proper step_slug'
)
UNION ALL
SELECT is(
  (SELECT payload FROM tasks),
  jsonb_build_object('run', 'hello')::jsonb,
  'Returns proper step_slug'
);

SELECT finish();
ROLLBACK;
