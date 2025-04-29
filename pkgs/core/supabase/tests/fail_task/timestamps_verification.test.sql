begin;
select plan(6);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- Start a flow run
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- Fail the first task with no retries
select pgflow.create_flow('fail_test', max_attempts => 0);
select pgflow.add_step('fail_test', 'will_fail', max_attempts => 0);
select pgflow.start_flow('fail_test', '"hello"'::jsonb);
select pgflow_tests.poll_and_fail('fail_test');

-- TEST: Task should have failed_at timestamp set when failed
select ok(
  (select failed_at is not null from pgflow.step_tasks where flow_slug = 'fail_test' limit 1),
  'Task should have failed_at timestamp set when failed'
);

-- TEST: Task should have failed_at after queued_at
select ok(
  (select queued_at < failed_at from pgflow.step_tasks where flow_slug = 'fail_test' limit 1),
  'Task failed_at should be after queued_at'
);

-- TEST: Step state should have failed_at timestamp set when failed
select ok(
  (select failed_at is not null from pgflow.step_states where flow_slug = 'fail_test' limit 1),
  'Step state should have failed_at timestamp set when failed'
);

-- TEST: Step state should have failed_at after started_at
select ok(
  (select started_at < failed_at from pgflow.step_states where flow_slug = 'fail_test' limit 1),
  'Step state failed_at should be after started_at'
);

-- TEST: Run should have failed_at timestamp set when failed
select ok(
  (select failed_at is not null from pgflow.runs where flow_slug = 'fail_test' limit 1),
  'Run should have failed_at timestamp set when failed'
);

-- TEST: Run should have failed_at after started_at
select ok(
  (select started_at < failed_at from pgflow.runs where flow_slug = 'fail_test' limit 1),
  'Run failed_at should be after started_at'
);

select finish();
rollback;
