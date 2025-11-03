begin;
select plan(6);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database and create flow: root_map -> dependent_map
select pgflow_tests.reset_db();
select pgflow.create_flow('cascade_map_chain');
select pgflow.add_step('cascade_map_chain', 'root_map', step_type => 'map');
select pgflow.add_step('cascade_map_chain', 'dependent_map', deps_slugs => ARRAY['root_map'], step_type => 'map');

-- Start flow with empty array (should cascade-complete both maps)
with flow as (
  select * from pgflow.start_flow('cascade_map_chain', '[]'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: Verify both steps completed
select is(
  (select count(*) from pgflow.step_states where status = 'completed'),
  2::bigint,
  'Both root_map and dependent_map should be completed'
);

-- Test 2: Verify both have initial_tasks=0
select results_eq(
  $$ SELECT step_slug, initial_tasks FROM pgflow.step_states ORDER BY step_slug $$,
  $$ VALUES ('dependent_map', 0), ('root_map', 0) $$,
  'Both maps should have initial_tasks=0'
);

-- Test 3: Verify root_map step:completed event was broadcast
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'root_map'),
  1::int,
  'Root map should broadcast step:completed event'
);

-- Test 4: Verify dependent_map step:completed event was broadcast
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'dependent_map'),
  1::int,
  'Dependent map should broadcast step:completed event via cascade'
);

-- Test 5: Verify both events have status=completed
select is(
  (select count(*) from realtime.messages
   where payload->>'event_type' = 'step:completed'
     and payload->>'status' = 'completed'
     and payload->>'run_id' = (select run_id::text from run_ids)),
  2::bigint,
  'Both step:completed events should have status "completed"'
);

-- Test 6: Verify events broadcast in correct order (root_map first, then dependent_map)
select results_eq(
  $$ SELECT payload->>'step_slug'
     FROM realtime.messages
     WHERE payload->>'event_type' = 'step:completed'
       AND payload->>'run_id' = (SELECT run_id::text FROM run_ids)
     ORDER BY id $$,
  $$ VALUES ('root_map'), ('dependent_map') $$,
  'Events should be broadcast in topological order: root_map, then dependent_map'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
