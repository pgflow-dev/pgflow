begin;
select plan(2);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- Start a flow run
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- Get the run_id for later use
\set run_id `select run_id from pgflow.runs limit 1`

-- TEST: Step task should have queued_at timestamp set
select isnt(
  (select queued_at from pgflow.step_tasks 
   where run_id = :'run_id' and step_slug = 'first'),
  null,
  'Step task should have queued_at timestamp set'
);

-- TEST: Step task should have completed_at and failed_at as null
select results_eq(
  $$ SELECT completed_at, failed_at from pgflow.step_tasks 
     where run_id = :'run_id' and step_slug = 'first' $$,
  $$ VALUES (null::timestamptz, null::timestamptz) $$,
  'Step task should have completed_at and failed_at as null'
);

select finish();
rollback;
