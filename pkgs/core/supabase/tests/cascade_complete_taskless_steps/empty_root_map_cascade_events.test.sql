begin;
select plan(4);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database and create flow with single root map step
select pgflow_tests.reset_db();
select pgflow.create_flow('empty_root_map');
select pgflow.add_step('empty_root_map', 'process', step_type => 'map');

-- Start flow with empty array (should cascade-complete the map step)
with flow as (
  select * from pgflow.start_flow('empty_root_map', '[]'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: Verify step completed in database
select is(
  (select status from pgflow.step_states where step_slug = 'process'),
  'completed',
  'Empty root map step should be completed'
);

-- Test 2: Verify step:completed event was broadcast
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'process'),
  1::int,
  'Empty root map should broadcast step:completed event via cascade'
);

-- Test 3: Verify event has correct status
select is(
  (select payload->>'status' from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'process')),
  'completed',
  'Cascade event should have status "completed"'
);

-- Test 4: Verify event has empty array output
select is(
  (select payload->'output'::text from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'process')),
  '[]',
  'Cascade event should have empty array output'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
