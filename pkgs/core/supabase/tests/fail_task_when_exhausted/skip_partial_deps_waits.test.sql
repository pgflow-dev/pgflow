-- Test: when_exhausted='skip' decrements remaining_deps but step waits if other deps remain
--
-- Flow structure:
--   step_a (when_exhausted='skip', max_attempts=0) ─┐
--   step_b ───────────────────────────────────────┼──> step_c (depends on both)
--
-- Expected behavior:
--   1. step_a fails and gets skipped
--   2. step_c.remaining_deps decremented from 2 to 1
--   3. step_c does NOT start yet (still waiting for step_b)
--   4. Run continues (not failed)

begin;
select plan(5);
select pgflow_tests.reset_db();

-- Create flow: step_a + step_b -> step_c
select pgflow.create_flow('partial_skip');
select pgflow.add_step('partial_skip', 'step_a', max_attempts => 0, when_exhausted => 'skip');
select pgflow.add_step('partial_skip', 'step_b');
select pgflow.add_step('partial_skip', 'step_c', array['step_a', 'step_b']);

-- Start the flow
select pgflow.start_flow('partial_skip', '"input"'::jsonb);

-- Verify step_c starts with remaining_deps = 2
select is(
  (
    select remaining_deps from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'step_c'
  ),
  2::int,
  'step_c should start with remaining_deps = 2'
);

-- Poll and fail step_a (step_b is still running)
with started as (
  select * from pgflow_tests.read_and_start('partial_skip', qty => 10)
),
target as (
  select run_id, step_slug, task_index
  from started
  where step_slug = 'step_a'
  limit 1
)
select pgflow.fail_task(
  (select run_id from target),
  (select step_slug from target),
  (select task_index from target),
  (select step_slug from target) || ' FAILED'
);

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

-- Test 2: step_c.remaining_deps should be decremented to 1 (not 0)
select is(
  (
    select remaining_deps from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'step_c'
  ),
  1::int,
  'step_c.remaining_deps should be decremented to 1 (waiting for step_b)'
);

-- Test 3: step_c should NOT be started yet (still 'created')
select is(
  (
    select status from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'step_c'
  ),
  'created',
  'step_c should still be created (waiting for step_b)'
);

-- Test 4: Run should continue (not failed)
select isnt(
  (select status from pgflow.runs limit 1),
  'failed',
  'Run should not be failed (continues with step_b)'
);

select finish();
rollback;
