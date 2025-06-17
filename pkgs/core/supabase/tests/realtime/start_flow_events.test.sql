begin;
select plan(7);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database and create test flow
select pgflow_tests.reset_db();
select pgflow.create_flow('sequential');
select pgflow.add_step('sequential', 'first');

-- Start flow and capture run_id
with flow as (
  select * from pgflow.start_flow('sequential', '{"test_data": "value"}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: Verify one run:started event exists
select is(
  pgflow_tests.count_realtime_events('run:started', (select run_id from run_ids)),
  1::int,
  'pgflow.start_flow should send exactly one run:started event'
);

-- Test 2: Verify flow_slug in event payload
select is(
  (select payload->>'flow_slug' from pgflow_tests.get_realtime_message('run:started', (select run_id from run_ids))),
  'sequential',
  'The run:started event should contain the correct flow_slug'
);

-- Test 3: Verify status in event payload
select is(
  (select payload->>'status' from pgflow_tests.get_realtime_message('run:started', (select run_id from run_ids))),
  'started',
  'The run:started event should have status "started"'
);

-- Test 4: Verify started_at timestamp exists and is valid
select ok(
  (select (payload->>'started_at')::timestamptz is not null 
   from pgflow_tests.get_realtime_message('run:started', (select run_id from run_ids))),
  'The run:started event should include a started_at timestamp'
);

-- Test 5: Verify input data is included in payload
select is(
  (select payload->'input'->>'test_data' 
   from pgflow_tests.get_realtime_message('run:started', (select run_id from run_ids))),
  'value',
  'The run:started event should contain the correct input data'
);

-- Test 6: Verify event name formatting
select is(
  (select event from pgflow_tests.get_realtime_message('run:started', (select run_id from run_ids))),
  'run:started',
  'The run:started event should have the correct event name'
);

-- Test 7: Verify topic formatting
select is(
  (select topic from pgflow_tests.get_realtime_message('run:started', (select run_id from run_ids))),
  concat('pgflow:run:', (select run_id from run_ids)),
  'The run:started event should have the correct topic (pgflow:run:<run_id>)'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;