-- Test: when_failed='skip' on the only step should complete the run
--
-- Flow structure:
--   step_a (when_failed='skip', max_attempts=0) - only step in flow
--
-- Expected behavior:
--   1. step_a fails and gets skipped
--   2. remaining_steps decremented to 0
--   3. Run completes (status='completed')

begin;
select plan(4);
select pgflow_tests.reset_db();

-- Create flow with single step
select pgflow.create_flow('single_skip');
select pgflow.add_step('single_skip', 'step_a', max_attempts => 0, when_failed => 'skip');

-- Start the flow
select pgflow.start_flow('single_skip', '"input"'::jsonb);

-- Verify run starts with remaining_steps = 1
select is(
  (select remaining_steps from pgflow.runs limit 1),
  1::int,
  'Run should start with remaining_steps = 1'
);

-- Poll and fail step_a
select pgflow_tests.poll_and_fail('single_skip');

-- Test 1: step_a should be skipped
select is(
  (
    select status from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'step_a'
  ),
  'skipped',
  'step_a should be skipped after failure'
);

-- Test 2: remaining_steps should be 0
select is(
  (select remaining_steps from pgflow.runs limit 1),
  0::int,
  'Run remaining_steps should be 0'
);

-- Test 3: Run should be completed
select is(
  (select status from pgflow.runs limit 1),
  'completed',
  'Run should be completed when only step is skipped'
);

select finish();
rollback;
