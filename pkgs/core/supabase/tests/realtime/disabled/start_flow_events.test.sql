begin;
select plan(2);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database and create test flow
select pgflow_tests.reset_db();
select pgflow.create_flow('sequential');
select pgflow.add_step('sequential', 'first');

-- Start flow with realtime disabled and capture run_id
with flow as (
  select * from pgflow.start_flow('sequential', '{"test_data": "value"}'::jsonb, realtime => 'false')
)
select run_id into temporary run_ids from flow;

-- Test 1: Verify no realtime events are sent
select is(
  pgflow_tests.count_realtime_events('run:started', (select run_id from run_ids)),
  0::int,
  'pgflow.start_flow with realtime disabled should send no events'
);

-- Test 2: Verify realtime_channel is NULL in database
select is(
  (select realtime_channel from pgflow.runs where run_id = (select run_id from run_ids)),
  NULL,
  'pgflow.start_flow with realtime disabled should set realtime_channel to NULL'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;