BEGIN;
SELECT plan(5);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');

-- Start a flow run
SELECT pgflow.start_flow('sequential', '"hello"'::jsonb);

-- Complete the first task
SELECT pgflow.complete_task(
  (SELECT run_id FROM pgflow.runs LIMIT 1),
  'first',
  0,
  '{"result": "first completed"}'::jsonb
);

-- TEST: Task should be marked as completed with correct output
SELECT results_eq(
  $$ SELECT status, output FROM pgflow.step_tasks
     WHERE run_id = (SELECT run_id FROM pgflow.runs LIMIT 1)
     AND step_slug = 'first' AND task_index = 0 $$,
  $$ VALUES ('completed', '{"result": "first completed"}'::jsonb) $$,
  'Task should be marked as completed with correct output'
);

-- TEST: Step state should be marked as completed
SELECT results_eq(
  $$ SELECT status, remaining_tasks FROM pgflow.step_states
     WHERE run_id = (SELECT run_id FROM pgflow.runs LIMIT 1)
     AND step_slug = 'first' $$,
  $$ VALUES ('completed', 0) $$,
  'Step state should be marked as completed with no remaining tasks'
);

-- TEST: Dependent step should have remaining_deps decremented
SELECT results_eq(
  $$ SELECT remaining_deps FROM pgflow.step_states
     WHERE run_id = (SELECT run_id FROM pgflow.runs LIMIT 1)
     AND step_slug = 'second' $$,
  $$ VALUES (0) $$,
  'Dependent step should have remaining_deps decremented to 0'
);

-- TEST: Dependent step task should be created and queued
SELECT results_eq(
  $$ SELECT status FROM pgflow.step_tasks
     WHERE run_id = (SELECT run_id FROM pgflow.runs LIMIT 1)
     AND step_slug = 'second' $$,
  $$ VALUES ('queued') $$,
  'Dependent step task should be created and queued'
);

-- TEST: Message should be in the queue for the dependent step
SELECT is(
  (SELECT count(*)::int FROM pgmq.q_sequential
   WHERE message->>'step_slug' = 'second'),
  1::int,
  'Message should be in the queue for the dependent step'
);

SELECT finish();
ROLLBACK;
