begin;
select plan(6);
select pgflow_tests.reset_db();

-- SETUP
select pgflow.create_flow('with_retry');
select pgflow.add_step(
  flow_slug => 'with_retry',
  step_slug => 'first',
  deps_slugs => '{}',
  max_attempts => 0,
  base_delay => 0
);
select pgflow.start_flow('with_retry', '{"test": true}'::JSONB);

-- max_attempts is 0, so failing once should mark the task as failed
select pgflow_tests.poll_and_fail('with_retry');

-- TEST: Task should have failed_at timestamp set
select isnt(
  (select failed_at from pgflow.step_tasks 
   where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'first'),
  null,
  'Task should have failed_at timestamp set'
);

-- TEST: Task should have completed_at as null
select is(
  (select completed_at from pgflow.step_tasks 
   where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'first'),
  null,
  'Task should have completed_at as null'
);

-- TEST: Step state should have failed_at timestamp set
select isnt(
  (select failed_at from pgflow.step_states 
   where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'first'),
  null,
  'Step state should have failed_at timestamp set'
);

-- TEST: Step state should have completed_at as null
select is(
  (select completed_at from pgflow.step_states 
   where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'first'),
  null,
  'Step state should have completed_at as null'
);

-- TEST: Run should have failed_at timestamp set
select isnt(
  (select failed_at from pgflow.runs where run_id = (select run_id from pgflow.runs limit 1)),
  null,
  'Run should have failed_at timestamp set'
);

-- TEST: Run should have completed_at as null
select is(
  (select completed_at from pgflow.runs where run_id = (select run_id from pgflow.runs limit 1)),
  null,
  'Run should have completed_at as null'
);

select finish();
rollback;
