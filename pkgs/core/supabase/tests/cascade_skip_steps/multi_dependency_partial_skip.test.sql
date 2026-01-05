-- Test: cascade_skip_steps - Multi-dependency scenario
-- Flow: A -> C, B -> C (C depends on both A and B)
-- Skipping A should cascade to C, even though B is still runnable
begin;
select plan(6);

-- Reset database and create a diamond-ish flow
select pgflow_tests.reset_db();
select pgflow.create_flow('multi_dep');
select pgflow.add_step('multi_dep', 'step_a');
select pgflow.add_step('multi_dep', 'step_b');
select pgflow.add_step('multi_dep', 'step_c', ARRAY['step_a', 'step_b']);

-- Start flow
with flow as (
  select * from pgflow.start_flow('multi_dep', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Skip step_a (should cascade to step_c)
select pgflow.cascade_skip_steps(
  (select run_id from run_ids),
  'step_a',
  'condition_unmet'
);

-- Test 1: step_a should be skipped
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_a'),
  'skipped',
  'step_a should be skipped'
);

-- Test 2: step_b should NOT be skipped (independent of step_a, root step so started)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_b'),
  'started',
  'step_b should remain in started status (independent root step)'
);

-- Test 3: step_c should be skipped (depends on skipped step_a)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_c'),
  'skipped',
  'step_c should be skipped (one of its deps was skipped)'
);

-- Test 4: step_c skip_reason should be dependency_skipped
select is(
  (select skip_reason from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_c'),
  'dependency_skipped',
  'step_c skip_reason should be dependency_skipped'
);

-- Test 5: remaining_steps should be 1 (only step_b)
select is(
  (select remaining_steps from pgflow.runs
   where run_id = (select run_id from run_ids)),
  1::int,
  'remaining_steps should be 1 (only step_b remains)'
);

-- Test 6: 2 step:skipped events (step_a and step_c)
select is(
  (select count(*) from realtime.messages
   where payload->>'event_type' = 'step:skipped'
     and payload->>'run_id' = (select run_id::text from run_ids)),
  2::bigint,
  'Should send 2 step:skipped events (step_a and step_c)'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
