begin;
select plan(5);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- Start a flow run
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- Get the run_id for later use
\set run_id `select run_id from pgflow.runs limit 1`

-- Record the current time before completing the task
\set before_time `select now()`

-- Complete the first task
select pgflow.complete_task(
  :'run_id',
  'first',
  0,
  '{"result": "first completed"}'::jsonb
);

-- Record the current time after completing the task
\set after_time `select now()`

-- TEST: Task completed_at should be between before_time and after_time
select ok(
  (select completed_at >= :'before_time'::timestamptz and completed_at <= :'after_time'::timestamptz 
   from pgflow.step_tasks where run_id = :'run_id' and step_slug = 'first'),
  'Task completed_at should be between before_time and after_time'
);

-- TEST: Step state completed_at should be between before_time and after_time
select ok(
  (select completed_at >= :'before_time'::timestamptz and completed_at <= :'after_time'::timestamptz 
   from pgflow.step_states where run_id = :'run_id' and step_slug = 'first'),
  'Step state completed_at should be between before_time and after_time'
);

-- TEST: Dependent step should have started_at between before_time and after_time
select ok(
  (select started_at >= :'before_time'::timestamptz and started_at <= :'after_time'::timestamptz 
   from pgflow.step_states where run_id = :'run_id' and step_slug = 'second'),
  'Dependent step should have started_at between before_time and after_time'
);

-- Complete all remaining tasks to complete the run
\set before_complete_run_time `select now()`
select pgflow.complete_task(:'run_id', 'second', 0, '{"result": "second completed"}'::jsonb);
select pgflow.complete_task(:'run_id', 'third', 0, '{"result": "third completed"}'::jsonb);
\set after_complete_run_time `select now()`

-- TEST: Run completed_at should be between before_complete_run_time and after_complete_run_time
select ok(
  (select completed_at >= :'before_complete_run_time'::timestamptz and completed_at <= :'after_complete_run_time'::timestamptz 
   from pgflow.runs where run_id = :'run_id'),
  'Run completed_at should be between before_complete_run_time and after_complete_run_time'
);

-- TEST: Run completed_at should be after started_at
select ok(
  (select completed_at > started_at from pgflow.runs where run_id = :'run_id'),
  'Run completed_at should be after started_at'
);

select finish();
rollback;
