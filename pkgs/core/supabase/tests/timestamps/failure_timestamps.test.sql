begin;
select plan(6);
select pgflow_tests.reset_db();

-- SETUP: Create a flow with a step that will fail immediately (max_attempts = 0)
select pgflow.create_flow('failure_test');
select pgflow.add_step('failure_test', 'will_fail', max_attempts => 0);
select pgflow.start_flow('failure_test', '{"test": true}'::JSONB);

-- SETUP: Fail the task
select pgflow_tests.poll_and_fail('failure_test');

-- TEST: Verify step_task has failed_at timestamp set when failed
select ok(
  (select failed_at is not null from pgflow.step_tasks where step_slug = 'will_fail' limit 1),
  'Step task should have failed_at timestamp set when failed'
);

-- TEST: Verify step_state has failed_at timestamp set when failed
select ok(
  (select failed_at is not null from pgflow.step_states where step_slug = 'will_fail' limit 1),
  'Step state should have failed_at timestamp set when failed'
);

-- TEST: Verify run has failed_at timestamp set when failed
select ok(
  (select failed_at is not null from pgflow.runs limit 1),
  'Run should have failed_at timestamp set when failed'
);

-- TEST: Verify timestamp ordering is correct for step_task
select ok(
  (
    select 
      queued_at < failed_at
    from pgflow.step_tasks 
    where step_slug = 'will_fail'
    limit 1
  ),
  'Step task failed_at should be after queued_at'
);

-- TEST: Verify timestamp ordering is correct for step_state
select ok(
  (
    select 
      started_at < failed_at
    from pgflow.step_states 
    where step_slug = 'will_fail'
    limit 1
  ),
  'Step state failed_at should be after started_at'
);

-- TEST: Verify timestamp ordering is correct for run
select ok(
  (
    select 
      started_at < failed_at
    from pgflow.runs 
    limit 1
  ),
  'Run failed_at should be after started_at'
);

select finish();
rollback;
