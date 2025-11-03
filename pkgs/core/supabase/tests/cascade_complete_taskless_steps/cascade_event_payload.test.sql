begin;
select plan(8);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database and create flow with single empty map
select pgflow_tests.reset_db();
select pgflow.create_flow('payload_check');
select pgflow.add_step('payload_check', 'empty_map', step_type => 'map');

-- Start flow with empty array
with flow as (
  select * from pgflow.start_flow('payload_check', '[]'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: Verify event_type field
select is(
  (select payload->>'event_type' from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'empty_map')),
  'step:completed',
  'Event payload should have event_type = "step:completed"'
);

-- Test 2: Verify run_id field exists and matches
select is(
  (select payload->>'run_id' from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'empty_map')),
  (select run_id::text from run_ids),
  'Event payload should have correct run_id'
);

-- Test 3: Verify step_slug field
select is(
  (select payload->>'step_slug' from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'empty_map')),
  'empty_map',
  'Event payload should have correct step_slug'
);

-- Test 4: Verify status field
select is(
  (select payload->>'status' from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'empty_map')),
  'completed',
  'Event payload should have status = "completed"'
);

-- Test 5: Verify started_at field exists and is a valid timestamp
select ok(
  (select (payload->>'started_at')::timestamptz is not null
   from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'empty_map')),
  'Event payload should have a valid started_at timestamp'
);

-- Test 6: Verify completed_at field exists and is a valid timestamp
select ok(
  (select (payload->>'completed_at')::timestamptz is not null
   from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'empty_map')),
  'Event payload should have a valid completed_at timestamp'
);

-- Test 7: Verify output field has empty array
select is(
  (select payload->'output'::text from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'empty_map')),
  '[]',
  'Event payload should have output = []'
);

-- Test 8: Verify event name formatting (step:<slug>:completed)
select is(
  (select event from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'empty_map')),
  'step:empty_map:completed',
  'Event should have correct event name format (step:<slug>:completed)'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
