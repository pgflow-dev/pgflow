-- Test: fail_task with when_failed='fail' (default) marks run as failed
-- This is the current behavior and should remain unchanged
begin;
select plan(3);
select pgflow_tests.reset_db();

-- SETUP: Create a flow with default when_failed='fail' (0 retries so it fails immediately)
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'step_a', max_attempts => 0);

-- Start flow and fail the task
select pgflow.start_flow('test_flow', '{}'::jsonb);
select pgflow_tests.poll_and_fail('test_flow');

-- TEST 1: Task should be failed
select is(
  (select status from pgflow.step_tasks where flow_slug = 'test_flow' and step_slug = 'step_a'),
  'failed',
  'Task should be marked as failed'
);

-- TEST 2: Step should be failed
select is(
  (select status from pgflow.step_states where flow_slug = 'test_flow' and step_slug = 'step_a'),
  'failed',
  'Step should be marked as failed'
);

-- TEST 3: Run should be failed
select is(
  (select status from pgflow.runs where flow_slug = 'test_flow'),
  'failed',
  'Run should be marked as failed when when_failed=fail (default)'
);

select finish();
rollback;
