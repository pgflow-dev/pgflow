begin;
select plan(9);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow
select pgflow.start_flow('sequential', '{"test": true}'::JSONB);
select pgflow.poll_for_tasks('sequential', 1, 1);

-- TEST: Verify run has started_at timestamp set on creation
select ok(
  (select started_at is not null from pgflow.runs limit 1),
  'Run should have started_at timestamp set on creation'
);

-- TEST: Verify step_state has created_at timestamp set on creation
select ok(
  (select created_at is not null from pgflow.step_states where step_slug = 'first' limit 1),
  'Step state should have created_at timestamp set on creation'
);

-- TEST: Verify step_state has started_at timestamp set when started
select ok(
  (select started_at is not null from pgflow.step_states where step_slug = 'first' limit 1),
  'Root step state should have started_at timestamp set when started'
);

-- TEST: Verify step_task has queued_at timestamp set on creation
select ok(
  (select queued_at is not null from pgflow.step_tasks where step_slug = 'first' limit 1),
  'Step task should have queued_at timestamp set on creation'
);

-- SETUP: Complete the first task
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'first',
  0,
  '"first was successful"'::JSONB
);

-- TEST: Verify step_task has completed_at timestamp set when completed
select ok(
  (select completed_at is not null from pgflow.step_tasks where step_slug = 'first' limit 1),
  'Step task should have completed_at timestamp set when completed'
);

-- TEST: Verify step_state has completed_at timestamp set when completed
select ok(
  (select completed_at is not null from pgflow.step_states where step_slug = 'first' limit 1),
  'Step state should have completed_at timestamp set when completed'
);

-- SETUP: Poll and fail the second task
select pgflow_tests.poll_and_fail('sequential', 1, 1);

-- TEST: Verify step_task has failed_at timestamp set when failed
select ok(
  (select failed_at is not null from pgflow.step_tasks where step_slug = 'second' limit 1),
  'Step task should have failed_at timestamp set when failed'
);

-- SETUP: Complete all remaining tasks to complete the run
select pgflow_tests.reset_message_visibility('sequential');
select pgflow_tests.poll_and_complete('sequential', 1, 1);
select pgflow_tests.poll_and_complete('sequential', 1, 1);

-- TEST: Verify run has completed_at timestamp set when completed
select ok(
  (select completed_at is not null from pgflow.runs limit 1),
  'Run should have completed_at timestamp set when completed'
);

-- TEST: Verify timestamp ordering is correct
select ok(
  (
    select 
      started_at < completed_at
    from pgflow.runs 
    limit 1
  ),
  'Run completed_at should be after started_at'
);

select finish();
rollback;
