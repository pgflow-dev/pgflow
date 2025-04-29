begin;
select plan(6);
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

-- TEST: Task should have completed_at timestamp set when completed
select ok(
  (select completed_at is not null from pgflow.step_tasks where step_slug = 'first' limit 1),
  'Task should have completed_at timestamp set when completed'
);

-- TEST: Task should have completed_at after queued_at
select ok(
  (select queued_at < completed_at from pgflow.step_tasks where step_slug = 'first' limit 1),
  'Task completed_at should be after queued_at'
);

-- TEST: Step state should have completed_at timestamp set when completed
select ok(
  (select completed_at is not null from pgflow.step_states where step_slug = 'first' limit 1),
  'Step state should have completed_at timestamp set when completed'
);

-- TEST: Step state should have completed_at after started_at
select ok(
  (select started_at < completed_at from pgflow.step_states where step_slug = 'first' limit 1),
  'Step state completed_at should be after started_at'
);

-- Complete all remaining tasks to complete the run
select pgflow_tests.poll_and_complete('sequential', 1, 1);
select pgflow_tests.poll_and_complete('sequential', 1, 1);

-- TEST: Run should have completed_at timestamp set when completed
select ok(
  (select completed_at is not null from pgflow.runs limit 1),
  'Run should have completed_at timestamp set when completed'
);

-- TEST: Run should have completed_at after started_at
select ok(
  (select started_at < completed_at from pgflow.runs limit 1),
  'Run completed_at should be after started_at'
);

select finish();
rollback;
