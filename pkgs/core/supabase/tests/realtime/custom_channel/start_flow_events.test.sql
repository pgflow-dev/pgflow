begin;
select plan(8);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database and create test flow
select pgflow_tests.reset_db();
select pgflow.create_flow('sequential');
select pgflow.add_step('sequential', 'first');

-- Start flow with custom channel and capture run_id
with flow as (
  select * from pgflow.start_flow('sequential', '{"test_data": "value"}'::jsonb, realtime => 'my-custom-channel')
)
select run_id into temporary run_ids from flow;

-- Test 1: Verify one run:started event exists
select is(
  pgflow_tests.count_realtime_events('run:started', (select run_id from run_ids)),
  1::int,
  'pgflow.start_flow with custom channel should send exactly one run:started event'
);

-- Test 2: Verify custom channel is used as topic
select is(
  (select topic from pgflow_tests.get_realtime_message('run:started', (select run_id from run_ids))),
  'my-custom-channel',
  'The run:started event should use the custom channel as topic'
);

-- Test 3: Verify realtime_channel is stored in database
select is(
  (select realtime_channel from pgflow.runs where run_id = (select run_id from run_ids)),
  'my-custom-channel',
  'pgflow.start_flow should store the custom channel in realtime_channel column'
);

-- Test 4: Verify flow_slug in event payload
select is(
  (select payload->>'flow_slug' from pgflow_tests.get_realtime_message('run:started', (select run_id from run_ids))),
  'sequential',
  'The run:started event should contain the correct flow_slug'
);

-- Test 5: Verify status in event payload
select is(
  (select payload->>'status' from pgflow_tests.get_realtime_message('run:started', (select run_id from run_ids))),
  'started',
  'The run:started event should have status "started"'
);

-- Test 6: Verify started_at timestamp exists and is valid
select ok(
  (select (payload->>'started_at')::timestamptz is not null 
   from pgflow_tests.get_realtime_message('run:started', (select run_id from run_ids))),
  'The run:started event should include a started_at timestamp'
);

-- Test 7: Verify input data is included in payload
select is(
  (select payload->'input'->>'test_data' 
   from pgflow_tests.get_realtime_message('run:started', (select run_id from run_ids))),
  'value',
  'The run:started event should contain the correct input data'
);

-- Test 8: Verify event name formatting
select is(
  (select event from pgflow_tests.get_realtime_message('run:started', (select run_id from run_ids))),
  'run:started',
  'The run:started event should have the correct event name'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;