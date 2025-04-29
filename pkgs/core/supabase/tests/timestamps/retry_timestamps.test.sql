begin;
select plan(4);
select pgflow_tests.reset_db();

-- SETUP: Create a flow with a step that will be retried once before succeeding
select pgflow.create_flow('retry_test');
select pgflow.add_step('retry_test', 'will_retry', max_attempts => 2, base_delay => 0);
select pgflow.start_flow('retry_test', '{"test": true}'::JSONB);

-- SETUP: Fail the task once
select pgflow_tests.poll_and_fail('retry_test');

-- TEST: Verify failed_at is set on the task after first failure
select ok(
  (select failed_at is not null from pgflow.step_tasks where step_slug = 'will_retry' limit 1),
  'Step task should have failed_at timestamp set after first failure'
);

-- TEST: Verify step_state does not have failed_at set yet (since we're retrying)
select ok(
  (select failed_at is null from pgflow.step_states where step_slug = 'will_retry' limit 1),
  'Step state should not have failed_at timestamp set when task is being retried'
);

-- SETUP: Complete the task on retry
select pgflow_tests.reset_message_visibility('retry_test');
select pgflow_tests.poll_and_complete('retry_test', 1, 1);

-- TEST: Verify completed_at is set on the task after successful retry
select ok(
  (select completed_at is not null from pgflow.step_tasks where step_slug = 'will_retry' limit 1),
  'Step task should have completed_at timestamp set after successful retry'
);

-- TEST: Verify step_state has completed_at set after successful retry
select ok(
  (select completed_at is not null from pgflow.step_states where step_slug = 'will_retry' limit 1),
  'Step state should have completed_at timestamp set after successful retry'
);

select finish();
rollback;
