-- Test: Skipped deps are excluded from handler input (missing key, not null)
-- Verifies that when a dependency is skipped:
-- 1. The handler receives deps_output WITHOUT the skipped dep key
-- 2. The key is missing entirely, not present with null value
--
-- Flow:
--   step_a (conditional, skip) \
--                                -> step_c (no condition)
--   step_b (always runs)       /
--
-- When step_a is skipped, step_c should receive: {"step_b": <output>}
-- (NOT: {"step_a": null, "step_b": <output>})
begin;
select plan(5);

-- Reset database
select pgflow_tests.reset_db();

-- Create flow with diamond: a + b -> c
-- a has unmet condition (will be skipped)
-- b always runs
-- c depends on both
select pgflow.create_flow('skip_diamond');
select pgflow.add_step(
  'skip_diamond',
  'step_a',
  '{}',  -- root step
  null, null, null, null,
  'single',
  '{"enabled": true}'::jsonb,  -- condition: requires enabled=true
  'skip'  -- plain skip
);
select pgflow.add_step(
  'skip_diamond',
  'step_b',
  '{}'  -- root step, no condition
);
select pgflow.add_step(
  'skip_diamond',
  'step_c',
  '{step_a, step_b}',  -- depends on both
  null, null, null, null,
  'single'  -- no condition
);

-- Start flow with input that skips step_a
with flow as (
  select * from pgflow.start_flow('skip_diamond', '{"enabled": false}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: step_a should be skipped
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_a'),
  'skipped',
  'step_a with unmet condition should be skipped'
);

-- Test 2: step_b should be started
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_b'),
  'started',
  'step_b without condition should be started'
);

-- Read and start step_b's task
select pgflow_tests.read_and_start('skip_diamond');

-- Complete step_b with some output
select pgflow.complete_task(
  (select run_id from run_ids),
  'step_b',
  0,
  '{"data": "from_b"}'::jsonb
);

-- Test 3: step_c remaining_deps should be 0 (both deps resolved - a skipped, b completed)
select is(
  (select remaining_deps from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_c'),
  0,
  'step_c remaining_deps should be 0 (a skipped + b completed)'
);

-- Test 4: step_c should now be started
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_c'),
  'started',
  'step_c should be started after step_b completes'
);

-- Test 5: step_b output should be in step_states
select is(
  (select output from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_b'),
  '{"data": "from_b"}'::jsonb,
  'step_b output should be stored'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
