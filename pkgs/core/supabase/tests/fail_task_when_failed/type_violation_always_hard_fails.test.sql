-- Test: TYPE_VIOLATION in complete_task always hard fails regardless of when_failed
-- TYPE_VIOLATION is a programming error (wrong return type), not a runtime condition
-- It should always cause the run to fail, even with when_failed='skip' or 'skip-cascade'
begin;
select plan(4);
select pgflow_tests.reset_db();

-- SETUP: Create a flow where step_a feeds into a map step
-- step_a has when_failed='skip-cascade' but TYPE_VIOLATION should override this
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'step_a', when_failed => 'skip-cascade');
select pgflow.add_step('test_flow', 'step_b', ARRAY['step_a'], step_type => 'map');

-- Start flow
select pgflow.start_flow('test_flow', '{}'::jsonb);

-- Poll for step_a's task and complete it with non-array output (causes TYPE_VIOLATION)
with task as (
  select * from pgflow_tests.read_and_start('test_flow', 1, 1)
)
select pgflow.complete_task(
  (select run_id from task),
  (select step_slug from task),
  0,
  '"not_an_array"'::jsonb  -- String instead of array - TYPE_VIOLATION
);

-- TEST 1: step_a should be marked as failed (not skipped)
select is(
  (select status from pgflow.step_states where flow_slug = 'test_flow' and step_slug = 'step_a'),
  'failed',
  'step_a should be failed on TYPE_VIOLATION (not skipped despite when_failed=skip-cascade)'
);

-- TEST 2: error_message should contain TYPE_VIOLATION
select ok(
  (select error_message from pgflow.step_states
   where flow_slug = 'test_flow' and step_slug = 'step_a') LIKE '%TYPE_VIOLATION%',
  'Error message should indicate TYPE_VIOLATION'
);

-- TEST 3: Run should be failed
select is(
  (select status from pgflow.runs where flow_slug = 'test_flow'),
  'failed',
  'Run should be failed on TYPE_VIOLATION regardless of when_failed setting'
);

-- TEST 4: step_b should NOT be skipped (run failed before cascade could happen)
select isnt(
  (select status from pgflow.step_states where flow_slug = 'test_flow' and step_slug = 'step_b'),
  'skipped',
  'step_b should not be skipped - run failed before any cascade'
);

select finish();
rollback;
