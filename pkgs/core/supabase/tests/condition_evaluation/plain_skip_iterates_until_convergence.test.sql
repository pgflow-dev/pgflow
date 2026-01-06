-- Test: Plain skip iterates until convergence
-- Verifies that after skipping a step:
-- 1. Dependents' remaining_deps are decremented
-- 2. Those newly-ready dependents get their conditions evaluated
-- 3. If they also have unmet conditions, they're also skipped
-- 4. Process repeats until no more steps need skipping
--
-- Flow: a (skip) -> b (skip) -> c (no condition)
-- When 'a' is skipped, 'b' becomes ready and should also be skipped
-- Then 'c' becomes ready (but has no condition, so starts normally)
begin;
select plan(8);

-- Reset database
select pgflow_tests.reset_db();

-- Create flow with chain: a -> b -> c
-- a has unmet condition (skip)
-- b depends on a.success (also skip)
-- c has no condition
select pgflow.create_flow('chain_skip');
select pgflow.add_step(
  'chain_skip',
  'step_a',
  '{}',  -- root step
  null, null, null, null,
  'single',
  '{"enabled": true}'::jsonb,  -- if: requires enabled=true
  'skip'  -- plain skip
);
select pgflow.add_step(
  'chain_skip',
  'step_b',
  '{step_a}',  -- depends on a
  null, null, null, null,
  'single',
  '{"step_a": {"success": true}}'::jsonb,  -- if: a.success must be true
  'skip'  -- plain skip (won't be met since a was skipped)
);
select pgflow.add_step(
  'chain_skip',
  'step_c',
  '{step_b}',  -- depends on b
  null, null, null, null,
  'single'  -- no condition
);

-- Start flow with input that does NOT match step_a's condition
with flow as (
  select * from pgflow.start_flow('chain_skip', '{"enabled": false}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: step_a should be skipped
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_a'),
  'skipped',
  'step_a with unmet condition should be skipped'
);

-- Test 2: step_b should also be skipped (its condition references skipped step_a)
-- The condition '{"step_a": {"success": true}}' cannot be met when step_a is skipped
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_b'),
  'skipped',
  'step_b should be skipped (condition references skipped dependency)'
);

-- Test 3: step_b skip_reason should be 'condition_unmet'
select is(
  (select skip_reason from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_b'),
  'condition_unmet',
  'step_b should have skip_reason = condition_unmet'
);

-- Test 4: step_c remaining_deps should be 0
select is(
  (select remaining_deps from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_c'),
  0,
  'step_c remaining_deps should be 0 (both a and b skipped)'
);

-- Test 5: step_c should be started (has no condition)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_c'),
  'started',
  'step_c with no condition should be started'
);

-- Test 6: step_c should have a task created
select is(
  (select count(*)::int from pgflow.step_tasks
   where run_id = (select run_id from run_ids) and step_slug = 'step_c'),
  1,
  'step_c should have one task created'
);

-- Test 7: Run remaining_steps should be 1 (only step_c)
select is(
  (select remaining_steps from pgflow.runs where run_id = (select run_id from run_ids)),
  1,
  'Run remaining_steps should be 1 (only step_c remaining)'
);

-- Test 8: Run should be started (not completed yet, step_c still running)
select is(
  (select status from pgflow.runs where run_id = (select run_id from run_ids)),
  'started',
  'Run should be started while step_c is running'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
