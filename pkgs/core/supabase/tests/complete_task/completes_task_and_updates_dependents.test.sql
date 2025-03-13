begin;
select plan(5);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- Start a flow run
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- Complete the first task
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'first',
  0,
  '{"result": "first completed"}'::jsonb
);

-- TEST: Task should be marked as completed with correct output
select results_eq(
  $$ SELECT status, output FROM pgflow.step_tasks
     WHERE run_id = (SELECT run_id FROM pgflow.runs LIMIT 1)
     AND step_slug = 'first' AND task_index = 0 $$,
  $$ VALUES ('completed', '{"result": "first completed"}'::jsonb) $$,
  'Task should be marked as completed with correct output'
);

-- TEST: Step state should be marked as completed
select results_eq(
  $$ SELECT status, remaining_tasks FROM pgflow.step_states
     WHERE run_id = (SELECT run_id FROM pgflow.runs LIMIT 1)
     AND step_slug = 'first' $$,
  $$ VALUES ('completed', 0) $$,
  'Step state should be marked as completed with no remaining tasks'
);

-- TEST: Dependent step should have remaining_deps decremented
select results_eq(
  $$ SELECT remaining_deps FROM pgflow.step_states
     WHERE run_id = (SELECT run_id FROM pgflow.runs LIMIT 1)
     AND step_slug = 'second' $$,
  $$ VALUES (0) $$,
  'Dependent step should have remaining_deps decremented to 0'
);

-- TEST: Dependent step task should be created and queued
select results_eq(
  $$ SELECT status FROM pgflow.step_tasks
     WHERE run_id = (SELECT run_id FROM pgflow.runs LIMIT 1)
     AND step_slug = 'second' $$,
  $$ VALUES ('queued') $$,
  'Dependent step task should be created and queued'
);

-- TEST: Message should be in the queue for the dependent step
select is(
  (
    select count(*)::int from pgmq.q_sequential
    where message ->> 'step_slug' = 'second'
  ),
  1::int,
  'Message should be in the queue for the dependent step'
);

select finish();
rollback;
