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

-- TEST: Task should have completed_at timestamp set
select isnt(
  (
    select completed_at from pgflow.step_tasks
    where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'first'
  ),
  null,
  'Task should have completed_at timestamp set'
);

-- TEST: Step state should have completed_at timestamp set
select isnt(
  (
    select completed_at from pgflow.step_states
    where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'first'
  ),
  null,
  'Step state should have completed_at timestamp set'
);

-- TEST: Dependent step should have started_at timestamp set
select isnt(
  (
    select started_at from pgflow.step_states
    where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'second'
  ),
  null,
  'Dependent step should have started_at timestamp set'
);

-- Complete all remaining tasks to complete the run
select
  pgflow.complete_task((select run_id from pgflow.runs limit 1), 'second', 0, '{"result": "second completed"}'::jsonb);
select
  pgflow.complete_task((select run_id from pgflow.runs limit 1), 'last', 0, '{"result": "last completed"}'::jsonb);

-- TEST: Run should have completed_at timestamp set
select isnt(
  (select completed_at from pgflow.runs where run_id = (select run_id from pgflow.runs limit 1)),
  null,
  'Run should have completed_at timestamp set'
);

-- TEST: Run completed_at should be after started_at
select ok(
  (select completed_at >= started_at from pgflow.runs where run_id = (select run_id from pgflow.runs limit 1)),
  'Run completed_at should be after started_at'
);

select finish();
rollback;
