-- Test: fail_task with when_failed='skip-cascade' skips step and cascades to dependents
begin;
select plan(7);
select pgflow_tests.reset_db();

-- SETUP: Create a flow with when_failed='skip-cascade'
-- step_a (will fail) -> step_b (depends on a) -> step_c (depends on b)
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'step_a', max_attempts => 0, when_failed => 'skip-cascade');
select pgflow.add_step('test_flow', 'step_b', ARRAY['step_a']);
select pgflow.add_step('test_flow', 'step_c', ARRAY['step_b']);
select pgflow.add_step('test_flow', 'step_d');  -- Independent step to verify run continues

-- Start flow and fail step_a's task
select pgflow.start_flow('test_flow', '{}'::jsonb);
select pgflow_tests.poll_and_fail('test_flow');

-- TEST 1: step_a should be skipped (not failed)
select is(
  (select status from pgflow.step_states where flow_slug = 'test_flow' and step_slug = 'step_a'),
  'skipped',
  'step_a should be marked as skipped when when_failed=skip-cascade'
);

-- TEST 2: step_a skip reason should be handler_failed
select is(
  (select skip_reason from pgflow.step_states where flow_slug = 'test_flow' and step_slug = 'step_a'),
  'handler_failed',
  'step_a skip reason should be handler_failed'
);

-- TEST 3: step_b (dependent) should be skipped via cascade
select is(
  (select status from pgflow.step_states where flow_slug = 'test_flow' and step_slug = 'step_b'),
  'skipped',
  'step_b should be cascaded-skipped'
);

-- TEST 4: step_b skip reason should indicate dependency skipped
select is(
  (select skip_reason from pgflow.step_states where flow_slug = 'test_flow' and step_slug = 'step_b'),
  'dependency_skipped',
  'step_b skip reason should be dependency_skipped'
);

-- TEST 5: step_c (transitive dependent) should also be skipped
select is(
  (select status from pgflow.step_states where flow_slug = 'test_flow' and step_slug = 'step_c'),
  'skipped',
  'step_c should be transitively cascade-skipped'
);

-- TEST 6: step_d (independent) should remain started (not affected)
select is(
  (select status from pgflow.step_states where flow_slug = 'test_flow' and step_slug = 'step_d'),
  'started',
  'step_d (independent step) should remain started'
);

-- TEST 7: Run should NOT be failed (continues running)
select isnt(
  (select status from pgflow.runs where flow_slug = 'test_flow'),
  'failed',
  'Run should NOT be marked as failed when when_failed=skip-cascade'
);

select finish();
rollback;
