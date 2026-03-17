-- Test: fail_task with when_failed='skip' skips the step and continues run
begin;
select plan(5);
select pgflow_tests.reset_db();

-- SETUP: Create a flow with when_failed='skip' (0 retries so it fails immediately)
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'step_a', max_attempts => 0, when_failed => 'skip');
select pgflow.add_step('test_flow', 'step_b');  -- Independent step to verify run continues

-- Start flow and fail step_a's task
select pgflow.start_flow('test_flow', '{}'::jsonb);
select pgflow_tests.poll_and_fail('test_flow');

-- TEST 1: Task should be failed (it still failed, but skip mode affects step/run)
select is(
  (select status from pgflow.step_tasks where flow_slug = 'test_flow' and step_slug = 'step_a'),
  'failed',
  'Task should be marked as failed'
);

-- TEST 2: Step should be skipped (not failed)
select is(
  (select status from pgflow.step_states where flow_slug = 'test_flow' and step_slug = 'step_a'),
  'skipped',
  'Step should be marked as skipped when when_failed=skip'
);

-- TEST 3: Skip reason should indicate handler failure
select is(
  (select skip_reason from pgflow.step_states where flow_slug = 'test_flow' and step_slug = 'step_a'),
  'handler_failed',
  'Skip reason should be handler_failed'
);

-- TEST 4: Run should NOT be failed (continues running)
select isnt(
  (select status from pgflow.runs where flow_slug = 'test_flow'),
  'failed',
  'Run should NOT be marked as failed when when_failed=skip'
);

-- TEST 5: Error message should be preserved in step_states
select is(
  (select error_message from pgflow.step_states where flow_slug = 'test_flow' and step_slug = 'step_a'),
  'step_a FAILED',
  'Error message should be preserved on skipped step'
);

select finish();
rollback;
