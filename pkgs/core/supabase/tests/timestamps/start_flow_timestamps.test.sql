begin;
select plan(5);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- Record the current time before starting the flow
\set before_time `select now()`

-- Start a flow run
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- Record the current time after starting the flow
\set after_time `select now()`

-- Get the run_id for later use
\set run_id `select run_id from pgflow.runs limit 1`

-- TEST: Run started_at should be between before_time and after_time
select ok(
  (select started_at >= :'before_time'::timestamptz and started_at <= :'after_time'::timestamptz 
   from pgflow.runs where run_id = :'run_id'),
  'Run started_at should be between before_time and after_time'
);

-- TEST: Step states created_at should be between before_time and after_time
select ok(
  (select bool_and(created_at >= :'before_time'::timestamptz and created_at <= :'after_time'::timestamptz)
   from pgflow.step_states where run_id = :'run_id'),
  'Step states created_at should be between before_time and after_time'
);

-- TEST: Step tasks queued_at should be between before_time and after_time
select ok(
  (select bool_and(queued_at >= :'before_time'::timestamptz and queued_at <= :'after_time'::timestamptz)
   from pgflow.step_tasks where run_id = :'run_id'),
  'Step tasks queued_at should be between before_time and after_time'
);

-- TEST: Root step should have status 'started' and started_at set
select results_eq(
  $$ SELECT status, started_at IS NOT NULL from pgflow.step_states 
     where run_id = :'run_id' and step_slug = 'first' $$,
  $$ VALUES ('started', true) $$,
  'Root step should have status started and started_at set'
);

-- TEST: Non-root steps should have status 'created' and started_at NULL
select results_eq(
  $$ SELECT status, started_at IS NULL from pgflow.step_states 
     where run_id = :'run_id' and step_slug = 'second' $$,
  $$ VALUES ('created', true) $$,
  'Non-root steps should have status created and started_at NULL'
);

select finish();
rollback;
