-- Test: Multiple parents skipped then one completes should properly decrement remaining_deps
-- This tests the bug where remaining_deps under-decrementing causes the join step to never start
--
-- Flow structure:
--   branch_a (conditional, will run) \
--   branch_b (skip)                   -> join (depends on all three)
--   branch_c (skip)                  /
--
-- Expected behavior:
--   1. branch_a starts (condition met), branch_b and branch_c are skipped
--   2. join.remaining_deps should be decremented by 2 (for skipped branches) to 1
--   3. After branch_a completes, join.remaining_deps goes from 1 to 0
--   4. join should start
--
-- Bug behavior (current):
--   1. branch_a runs, branch_b and branch_c are skipped
--   2. join.remaining_deps is only decremented by 1 (from 3 to 2) instead of 2 (to 1)
--   3. After branch_a completes, join.remaining_deps goes from 2 to 1
--   4. join stays stuck with remaining_deps = 1 forever

begin;
select plan(6);
select pgflow_tests.reset_db();

-- Create flow with three conditional branches
select pgflow.create_flow('multi_skip_partial');
select pgflow.add_step(
  flow_slug => 'multi_skip_partial',
  step_slug => 'branch_a',
  required_input_pattern => '{"route": "a"}'::jsonb,
  when_unmet => 'skip'
);
select pgflow.add_step(
  flow_slug => 'multi_skip_partial',
  step_slug => 'branch_b',
  required_input_pattern => '{"route": "b"}'::jsonb,
  when_unmet => 'skip'
);
select pgflow.add_step(
  flow_slug => 'multi_skip_partial',
  step_slug => 'branch_c',
  required_input_pattern => '{"route": "c"}'::jsonb,
  when_unmet => 'skip'
);
select pgflow.add_step(
  flow_slug => 'multi_skip_partial',
  step_slug => 'join',
  deps_slugs => ARRAY['branch_a', 'branch_b', 'branch_c']
);

-- Start flow with input that only matches branch_a's condition
with flow as (
  select * from pgflow.start_flow('multi_skip_partial', '{"route": "a"}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: branch_a should be started (condition met)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'branch_a'),
  'started',
  'branch_a should start (condition met)'
);

-- Test 2: branch_b should be skipped
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'branch_b'),
  'skipped',
  'branch_b should be skipped (condition unmet)'
);

-- Test 3: branch_c should be skipped
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'branch_c'),
  'skipped',
  'branch_c should be skipped (condition unmet)'
);

-- Test 4: join.remaining_deps should be 1 (one running, two skipped)
-- After skips: should be 3 - 2 = 1
select is(
  (select remaining_deps from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'join'),
  1,
  'join.remaining_deps should be 1 after two parents are skipped (one still running)'
);

-- Complete branch_a
select pgflow_tests.poll_and_complete('multi_skip_partial');

-- Test 5: After branch_a completes, join.remaining_deps should be 0
select is(
  (select remaining_deps from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'join'),
  0,
  'join.remaining_deps should be 0 after branch_a completes'
);

-- Test 6: join should be started
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'join'),
  'started',
  'join should start after all dependencies are resolved'
);

drop table if exists run_ids;
select finish();
rollback;
