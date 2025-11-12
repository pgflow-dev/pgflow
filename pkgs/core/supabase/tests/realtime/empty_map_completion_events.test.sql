begin;
select plan(8);

-- Reset database and create flow with root map step
select pgflow_tests.reset_db();
select pgflow.create_flow('empty_map_test');
select pgflow.add_step('empty_map_test', 'root_map', step_type => 'map');

-- Start flow with empty array (should complete map immediately)
with flow as (
  select * from pgflow.start_flow('empty_map_test', '[]'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: Verify step:completed event for empty map
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'root_map'),
  1::int,
  'Empty map step should send step:completed event immediately'
);

-- Test 2: Verify output is empty array
select is(
  (select payload->'output'::text from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'root_map')),
  '[]',
  'Empty map completion should have empty array output'
);

-- Test 3: Verify status is completed
select is(
  (select payload->>'status' from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'root_map')),
  'completed',
  'Empty map should have status "completed"'
);

-- Test 4: Verify started_at and completed_at both exist
select ok(
  (select (payload->>'started_at')::timestamptz is not null
     AND (payload->>'completed_at')::timestamptz is not null
   from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'root_map')),
  'Empty map should have both started_at and completed_at timestamps'
);

-- Test 5: Verify started_at and completed_at are nearly identical (instant completion)
select ok(
  (select extract(epoch from (payload->>'completed_at')::timestamptz - (payload->>'started_at')::timestamptz) < 0.1
   from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'root_map')),
  'Empty map should complete instantly (< 100ms difference between started_at and completed_at)'
);

-- Test 6: Verify event name formatting
select is(
  (select event from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'root_map')),
  'step:root_map:completed',
  'The step:completed event should have the correct event name (step:<slug>:completed)'
);

-- Test 7: Verify run also completes
select is(
  pgflow_tests.count_realtime_events('run:completed', (select run_id from run_ids)),
  1::int,
  'Run with only empty map should also complete and send run:completed event'
);

-- Test 8: Verify NO step:started event (goes straight to completed)
select is(
  pgflow_tests.count_realtime_events('step:started', (select run_id from run_ids), 'root_map'),
  0::int,
  'Empty map should NOT send step:started event (instant completion means it never starts in the traditional sense)'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
