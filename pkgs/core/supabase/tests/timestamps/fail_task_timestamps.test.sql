begin;
select plan(4);
select pgflow_tests.reset_db();

-- SETUP
select pgflow.create_flow('with_retry');
select pgflow.add_step('with_retry', 'first', max_attempts => 0, base_delay => 0);
select pgflow.start_flow('with_retry', '{"test": true}'::JSONB);

-- Get the run_id for later use
\set run_id `select run_id from pgflow.runs limit 1`

-- Record the current time before failing the task
\set before_time `select now()`

-- max_attempts is 0, so failing once should mark the task as failed
select pgflow_tests.poll_and_fail('with_retry');

-- Record the current time after failing the task
\set after_time `select now()`

-- TEST: Task failed_at should be between before_time and after_time
select ok(
  (select failed_at >= :'before_time'::timestamptz and failed_at <= :'after_time'::timestamptz 
   from pgflow.step_tasks where run_id = :'run_id' and step_slug = 'first'),
  'Task failed_at should be between before_time and after_time'
);

-- TEST: Step state failed_at should be between before_time and after_time
select ok(
  (select failed_at >= :'before_time'::timestamptz and failed_at <= :'after_time'::timestamptz 
   from pgflow.step_states where run_id = :'run_id' and step_slug = 'first'),
  'Step state failed_at should be between before_time and after_time'
);

-- TEST: Run failed_at should be between before_time and after_time
select ok(
  (select failed_at >= :'before_time'::timestamptz and failed_at <= :'after_time'::timestamptz 
   from pgflow.runs where run_id = :'run_id'),
  'Run failed_at should be between before_time and after_time'
);

-- TEST: Run failed_at should be after started_at
select ok(
  (select failed_at > started_at from pgflow.runs where run_id = :'run_id'),
  'Run failed_at should be after started_at'
);

select finish();
rollback;
