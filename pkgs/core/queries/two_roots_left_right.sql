BEGIN;

SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('two_roots_left_right');

SELECT pgflow.start_flow('two_roots_left_right', '"hello"'::jsonb);
SELECT pgflow.poll_for_tasks('two_roots_left_right', 1, 1);
SELECT pgflow.complete_task(
  (SELECT run_id FROM pgflow.runs LIMIT 1),
  'connected_root',
  0,
  '"connected_root completed"'::jsonb
);
SELECT pgflow.poll_for_tasks('two_roots_left_right', 1, 1);
SELECT pgflow.complete_task(
  (SELECT run_id FROM pgflow.runs LIMIT 1),
  'left',
  0,
  '"left completed"'::jsonb
);
-- select * from pgflow.step_tasks;
SELECT pgflow.poll_for_tasks('two_roots_left_right', 1, 1);
SELECT pgflow.complete_task(
  (SELECT run_id FROM pgflow.runs LIMIT 1),
  'disconnected_root',
  0,
  '"disconnected_root completed"'::jsonb
);
SELECT pgflow.poll_for_tasks('two_roots_left_right', 1, 1);
SELECT pgflow.complete_task(
  (SELECT run_id FROM pgflow.runs LIMIT 1),
  'right',
  0,
  '"right completed"'::jsonb
);

SELECT * FROM pgflow.runs;

ROLLBACK;
