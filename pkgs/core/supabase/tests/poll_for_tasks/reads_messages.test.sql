BEGIN;
SELECT plan(1);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run
SELECT pgflow.start_flow('sequential', '"hello"'::jsonb);

-- Prepare the actual query
PREPARE actual AS
SELECT flow_slug, run_id, step_slug, payload
FROM pgflow.poll_for_tasks(
  queue_name => 'sequential',
  vt => 1,
  qty => 1
)
LIMIT 1;

-- Prepare the expected result
PREPARE expected AS
SELECT 'sequential'::text AS flow_slug,
       (SELECT run_id FROM pgflow.runs WHERE flow_slug = 'sequential' LIMIT 1) AS run_id,
       'first'::text AS step_slug,
       jsonb_build_object('run', 'hello')::jsonb AS payload;

-- Compare the results
SELECT results_eq(
  'actual',
  'expected',
  'poll_for_tasks() returns the expected worker task'
);

SELECT finish();
ROLLBACK;
