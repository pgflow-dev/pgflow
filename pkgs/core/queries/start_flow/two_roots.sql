BEGIN;

SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');

SELECT pgflow.start_flow('sequential', '"hello"'::jsonb);
SELECT * FROM pgflow.step_states;
SELECT * FROM pgflow.step_tasks;

SELECT * FROM pgflow.poll_for_tasks('sequential', 1, 1);
SELECT * FROM pgflow.step_states;
SELECT * FROM pgflow.step_tasks;

SELECT pgflow.complete_task(
  (SELECT run_id FROM pgflow.runs LIMIT 1),
  'first',
  0,
  '"first completed"'::jsonb
);
SELECT * FROM pgflow.step_states;
SELECT * FROM pgflow.step_tasks;

SELECT * FROM pgflow.poll_for_tasks('sequential', 1, 1);

SELECT pgflow.complete_task(
  (SELECT run_id FROM pgflow.runs LIMIT 1),
  'second',
  0,
  '"second completed"'::jsonb
);
SELECT * FROM pgflow.step_states;
SELECT * FROM pgflow.step_tasks;

SELECT * FROM pgflow.poll_for_tasks('sequential', 1, 1);

SELECT pgflow.complete_task(
  (SELECT run_id FROM pgflow.runs LIMIT 1),
  'last',
  0,
  '"last completed"'::jsonb
);
SELECT * FROM pgflow.step_states;
SELECT * FROM pgflow.step_tasks;

SELECT * FROM pgflow.runs;

ROLLBACK;
