begin;
select plan(8);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database and setup a flow with multiple steps and dependencies
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('two_roots_left_right');
-- This creates:
--   connected_root
--   disconnected_root
--   left (depends on connected_root)
--   right (depends on connected_root)

-- Start the flow and capture the run_id
with flow as (
  select * from pgflow.start_flow('two_roots_left_right', '{"test_data": "value"}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: Verify run:started event
select is(
  pgflow_tests.count_realtime_events('run:started', (select run_id from run_ids)),
  1::int,
  'pgflow.start_flow should send one run:started event'
);

-- Complete the connected_root step
with task as (
  select * from pgflow.poll_for_tasks('two_roots_left_right', 1, 1) 
  where step_slug = 'connected_root'
)
select pgflow.complete_task(
  (select run_id from task),
  (select step_slug from task),
  0,
  '{"result": "success"}'::jsonb
) into temporary completed_connected_root;

-- Test 2: Verify step:completed event for connected_root
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'connected_root'),
  1::int,
  'pgflow.complete_task should send step:completed for connected_root'
);

-- Complete the disconnected_root step
with task as (
  select * from pgflow.poll_for_tasks('two_roots_left_right', 1, 1)
  where step_slug = 'disconnected_root'
)
select pgflow.complete_task(
  (select run_id from task),
  (select step_slug from task),
  0,
  '{"result": "success"}'::jsonb
) into temporary completed_disconnected_root;

-- Test 3: Verify step:completed event for disconnected_root
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'disconnected_root'),
  1::int,
  'pgflow.complete_task should send step:completed for disconnected_root'
);

-- Complete the left step
with task as (
  select * from pgflow.poll_for_tasks('two_roots_left_right', 1, 1)
  where step_slug = 'left'
)
select pgflow.complete_task(
  (select run_id from task),
  (select step_slug from task),
  0,
  '{"result": "success"}'::jsonb
) into temporary completed_left;

-- Test 4: Verify step:completed event for left
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'left'),
  1::int,
  'pgflow.complete_task should send step:completed for left'
);

-- Complete the right step
with task as (
  select * from pgflow.poll_for_tasks('two_roots_left_right', 1, 1)
  where step_slug = 'right'
)
select pgflow.complete_task(
  (select run_id from task),
  (select step_slug from task),
  0,
  '{"result": "success"}'::jsonb
) into temporary completed_right;

-- Test 5: Verify step:completed event for right
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'right'),
  1::int,
  'pgflow.complete_task should send step:completed for right'
);

-- Test 6: Verify run:completed event
select is(
  pgflow_tests.count_realtime_events('run:completed', (select run_id from run_ids)),
  1::int,
  'pgflow.maybe_complete_run should send one run:completed event'
);

-- Test 7: Verify run:failed event does not exist
select is(
  pgflow_tests.count_realtime_events('run:failed', (select run_id from run_ids)),
  0::int,
  'Should NOT send a run:failed event for successful flows'
);

-- Test 8: Verify step:failed event does not exist
select is(
  (select count(*) from realtime.messages 
   where payload->>'run_id' = (select run_id::text from run_ids)
   and payload->>'event_type' = 'step:failed'),
  0::bigint,
  'Should NOT send any step:failed events for successful flows'
);

-- Clean up
drop table if exists run_ids;
drop table if exists completed_connected_root;
drop table if exists completed_disconnected_root;
drop table if exists completed_left;
drop table if exists completed_right;

select finish();
rollback;