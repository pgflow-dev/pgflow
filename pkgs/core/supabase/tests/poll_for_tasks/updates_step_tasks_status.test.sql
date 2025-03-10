BEGIN;
SELECT * FROM plan(1);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run and poll some tasks
SELECT pgflow.start_flow('sequential', '"hello"'::jsonb);
SELECT pgflow.start_flow('sequential', '"hello"'::jsonb);
SELECT pgflow.start_flow('sequential', '"hello"'::jsonb);

-- SETUP: Poll a single task (qty = 1)
SELECT
    pgflow.poll_for_tasks(queue_name => 'sequential'::text, vt => 0, qty => 1);

-- TEST: Updates status of step_tasks to started
SELECT results_eq(
  $$
    SELECT 
      count(*)::integer, 
      (count(*) filter (where status = 'queued'))::integer, 
      (count(*) filter (where status = 'started'))::integer
    FROM pgflow.step_tasks
    WHERE flow_slug = 'sequential'
  $$,
  $$ VALUES (3, 2, 1) $$,
  'Updates status of step_tasks to started'
);

SELECT * FROM finish();
ROLLBACK;
