-- Test: Multiple parents skipped in same iteration should decrement remaining_deps for each
-- This tests the bug where remaining_deps is only decremented once even when multiple parents
-- are skipped simultaneously in cascade_resolve_conditions
--
-- Flow structure:
--   root_a (skip) \
--                  -> join (depends on both)
--   root_b (skip) /
--
-- Expected behavior:
--   1. Both root_a and root_b are skipped due to unmet conditions
--   2. join.remaining_deps should be decremented by 2 (from 2 to 0)
--   3. join should become ready and start
--
-- Bug behavior (current):
--   1. Both root_a and root_b are skipped
--   2. join.remaining_deps is only decremented by 1 (from 2 to 1)
--   3. join stays stuck with remaining_deps = 1 forever

begin;
select plan(5);
select pgflow_tests.reset_db();

-- Create flow with two conditional root steps that will both be skipped
select pgflow.create_flow('multi_root_skip');
select pgflow.add_step(
  flow_slug => 'multi_root_skip',
  step_slug => 'root_a',
  required_input_pattern => '{"go": true}'::jsonb,
  when_unmet => 'skip'
);
select pgflow.add_step(
  flow_slug => 'multi_root_skip',
  step_slug => 'root_b',
  required_input_pattern => '{"go": true}'::jsonb,
  when_unmet => 'skip'
);
select pgflow.add_step(
  flow_slug => 'multi_root_skip',
  step_slug => 'join',
  deps_slugs => ARRAY['root_a', 'root_b']
);

-- Start flow with input that does NOT match either condition
with flow as (
  select * from pgflow.start_flow('multi_root_skip', '{"go": false}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: root_a should be skipped
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'root_a'),
  'skipped',
  'root_a should be skipped (condition unmet)'
);

-- Test 2: root_b should be skipped
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'root_b'),
  'skipped',
  'root_b should be skipped (condition unmet)'
);

-- Test 3: join.remaining_deps should be 0 (both parents skipped)
select is(
  (select remaining_deps from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'join'),
  0,
  'join.remaining_deps should be 0 when both parents are skipped'
);

-- Test 4: join should be started (ready to run)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'join'),
  'started',
  'join should start after both parents are skipped'
);

-- Test 5: join should have a task created
select is(
  (select count(*)::int from pgflow.step_tasks
   where run_id = (select run_id from run_ids) and step_slug = 'join'),
  1,
  'join should have one task created'
);

drop table if exists run_ids;
select finish();
rollback;
