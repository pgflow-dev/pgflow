BEGIN;
SELECT plan(1);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run

WITH run AS (
  SELECT pgflow.start_flow('sequential', '"hello"'::jsonb)
),

tasks AS (
  SELECT * FROM pgflow.poll_for_tasks(
    queue_name => 'sequential',
    vt => 1,
    qty => 1
  )
)

SELECT results_eq(
  $$ SELECT * FROM tasks $$,
  row(
    'sequential'::text,                -- flow_slug
    (SELECT run_id FROM run),              -- run_id
    'first'::text,                    -- step_slug (not task_slug)
    jsonb_build_object('run', 'hello') -- payload in the format { run: "hello" }
  )::pgflow.worker_task,
  'Returns worker_task row with correct structure'
);

SELECT finish();
ROLLBACK;
