begin;
select plan(3);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database and create flow: root_map -> m1 -> m2 -> m3 -> m4 (all maps)
select pgflow_tests.reset_db();
select pgflow.create_flow('deep_cascade');
select pgflow.add_step('deep_cascade', 'root_map', step_type => 'map');
select pgflow.add_step('deep_cascade', 'm1', deps_slugs => ARRAY['root_map'], step_type => 'map');
select pgflow.add_step('deep_cascade', 'm2', deps_slugs => ARRAY['m1'], step_type => 'map');
select pgflow.add_step('deep_cascade', 'm3', deps_slugs => ARRAY['m2'], step_type => 'map');
select pgflow.add_step('deep_cascade', 'm4', deps_slugs => ARRAY['m3'], step_type => 'map');

-- Start flow with empty array (should cascade-complete all 5 steps)
with flow as (
  select * from pgflow.start_flow('deep_cascade', '[]'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: Verify all steps completed
select is(
  (select count(*) from pgflow.step_states where status = 'completed'),
  5::bigint,
  'All 5 map steps should be completed via cascade'
);

-- Test 2: Verify all step:completed events were broadcast (one per step)
select is(
  (select count(*) from realtime.messages
   where payload->>'event_type' = 'step:completed'
     and payload->>'run_id' = (select run_id::text from run_ids)),
  5::bigint,
  'Should broadcast 5 step:completed events (one for each step)'
);

-- Test 3: Verify all events have status=completed
select is(
  (select count(*) from realtime.messages
   where payload->>'event_type' = 'step:completed'
     and payload->>'status' = 'completed'
     and payload->>'run_id' = (select run_id::text from run_ids)),
  5::bigint,
  'All step:completed events should have status "completed"'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
