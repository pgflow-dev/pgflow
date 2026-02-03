-- Test: when_exhausted='skip' (non-cascade) should decrement remaining_deps on dependent steps
-- This mirrors the behavior in cascade_resolve_conditions.sql for when_unmet='skip'
--
-- Flow structure:
--   step_a (when_exhausted='skip', max_attempts=0) → step_b
--
-- Expected behavior:
--   1. step_a fails, gets skipped (when_exhausted='skip')
--   2. step_b.remaining_deps decremented from 1 to 0
--   3. step_b becomes ready and starts
--   4. Run continues (status != 'failed')

begin;
select plan(5);
select pgflow_tests.reset_db();

-- Create flow with step_a → step_b where step_a has when_exhausted='skip' and max_attempts=0
select pgflow.create_flow('skip_test');
select pgflow.add_step('skip_test', 'step_a', max_attempts => 0, when_exhausted => 'skip');
select pgflow.add_step('skip_test', 'step_b', array['step_a']);

-- Start the flow
select pgflow.start_flow('skip_test', '"input"'::jsonb);

-- Verify step_b starts with remaining_deps = 1
select is(
  (
    select remaining_deps from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'step_b'
  ),
  1::int,
  'step_b should start with remaining_deps = 1'
);

-- Poll and fail step_a (it has max_attempts=0, so it will be skipped immediately)
select pgflow_tests.poll_and_fail('skip_test');

-- Test 1: step_a should be skipped with handler_failed reason
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

-- Test 2: step_b.remaining_deps should be decremented to 0
select is(
  (
    select remaining_deps from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'step_b'
  ),
  0::int,
  'step_b.remaining_deps should be decremented to 0'
);

-- Test 3: step_b should be started (became ready when remaining_deps hit 0)
select is(
  (
    select status from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'step_b'
  ),
  'started',
  'step_b should be started (became ready)'
);

-- Test 4: Run should NOT be failed (continues with step_b)
select isnt(
  (select status from pgflow.runs limit 1),
  'failed',
  'Run should not be failed (continues with step_b)'
);

select finish();
rollback;
