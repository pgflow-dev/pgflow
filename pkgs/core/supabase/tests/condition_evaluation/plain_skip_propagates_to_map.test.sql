-- Test: Plain skip (whenUnmet='skip') propagates correctly to dependent map step
-- Verifies that when a step is skipped with plain 'skip' mode:
-- 1. remaining_deps on dependents is decremented
-- 2. initial_tasks is set to 0 for map dependents
-- 3. The run completes properly (not hanging)
--
-- This tests the bug fix: Before this fix, plain skip didn't update
-- remaining_deps on dependents, causing runs to hang forever.
begin;
select plan(8);

-- Reset database
select pgflow_tests.reset_db();

-- Create flow:
-- producer (conditional, skip) -> map_consumer (map step)
select pgflow.create_flow('skip_to_map');
select pgflow.add_step(
  flow_slug => 'skip_to_map',
  step_slug => 'producer',
  condition_pattern => '{"enabled": true}'::jsonb,  -- requires enabled=true
  when_unmet => 'skip'  -- plain skip (not skip-cascade)
);
-- Map consumer: no condition, just depends on producer
select pgflow.add_step(
  flow_slug => 'skip_to_map',
  step_slug => 'map_consumer',
  deps_slugs => ARRAY['producer'],
  step_type => 'map'
);

-- Start flow with input that does NOT match producer's condition
with flow as (
  select * from pgflow.start_flow('skip_to_map', '{"enabled": false}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: producer should be skipped
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'producer'),
  'skipped',
  'Producer with unmet condition should be skipped'
);

-- Test 2: producer skip_reason should be 'condition_unmet'
select is(
  (select skip_reason from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'producer'),
  'condition_unmet',
  'Producer should have skip_reason = condition_unmet'
);

-- Test 3: map_consumer remaining_deps should be 0 (decremented from 1)
select is(
  (select remaining_deps from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'map_consumer'),
  0,
  'Map consumer remaining_deps should be decremented to 0'
);

-- Test 4: map_consumer initial_tasks should be 0 (skipped parent = empty array)
select is(
  (select initial_tasks from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'map_consumer'),
  0,
  'Map consumer initial_tasks should be 0 (skipped dep = empty array)'
);

-- Test 5: map_consumer should be completed (cascade_complete_taskless_steps handles 0 tasks)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'map_consumer'),
  'completed',
  'Map consumer should be completed (empty map auto-completes)'
);

-- Test 6: map_consumer output should be empty array
select is(
  (select output from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'map_consumer'),
  '[]'::jsonb,
  'Map consumer output should be empty array'
);

-- Test 7: Run remaining_steps should be 0
select is(
  (select remaining_steps from pgflow.runs where run_id = (select run_id from run_ids)),
  0,
  'Run remaining_steps should be 0'
);

-- Test 8: Run should be completed (not hanging!)
select is(
  (select status from pgflow.runs where run_id = (select run_id from run_ids)),
  'completed',
  'Run should complete (not hang) when skip propagates to map'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
