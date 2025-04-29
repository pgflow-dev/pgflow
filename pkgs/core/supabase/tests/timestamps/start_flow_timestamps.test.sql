begin;
select plan(5);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- Start a flow run
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST: Run should have started_at timestamp set
select isnt(
  (select started_at from pgflow.runs limit 1),
  null,
  'Run should have started_at timestamp set'
);

-- TEST: Step states should have created_at timestamp set
select isnt(
  (select created_at from pgflow.step_states 
   where run_id = (select run_id from pgflow.runs limit 1) limit 1),
  null,
  'Step states should have created_at timestamp set'
);

-- TEST: Step tasks should have queued_at timestamp set
select isnt(
  (select queued_at from pgflow.step_tasks 
   where run_id = (select run_id from pgflow.runs limit 1) limit 1),
  null,
  'Step tasks should have queued_at timestamp set'
);

-- TEST: Root step should have status 'started' and started_at set
select results_eq(
  $$ SELECT status, started_at IS NOT NULL from pgflow.step_states 
     where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'first' $$,
  $$ VALUES ('started', true) $$,
  'Root step should have status started and started_at set'
);

-- TEST: Non-root steps should have status 'created' and started_at NULL
select results_eq(
  $$ SELECT status, started_at IS NULL from pgflow.step_states 
     where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'second' $$,
  $$ VALUES ('created', true) $$,
  'Non-root steps should have status created and started_at NULL'
);

select finish();
rollback;
