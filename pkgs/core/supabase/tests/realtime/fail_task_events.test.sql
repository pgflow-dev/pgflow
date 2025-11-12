begin;
select plan(10);

-- Reset database and setup a sequential flow with retry settings
select pgflow_tests.reset_db();
select pgflow.create_flow('sequential', max_attempts => 1); -- Set max_attempts to 1 so it fails permanently
select pgflow.add_step('sequential', 'first');

-- Start the flow and capture the run_id
with flow as (
  select * from pgflow.start_flow('sequential', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Poll for a task and fail it
with task as (
  select * from pgflow_tests.read_and_start('sequential', 1, 1)
)
select pgflow.fail_task(
  (select run_id from task),
  (select step_slug from task),
  0,
  'Test failure message'
) into temporary failed_tasks;

-- Test 1: Verify one run:failed event exists
select is(
  pgflow_tests.count_realtime_events('run:failed', (select run_id from run_ids)),
  1::int,
  'pgflow.fail_task should send a run:failed event when a run fails permanently'
);

-- Test 2: Verify run:failed event status
select is(
  (select payload->>'status' from pgflow_tests.get_realtime_message('run:failed', (select run_id from run_ids))),
  'failed',
  'The run:failed event should have status "failed"'
);

-- Test 3: Verify run:failed event topic
select is(
  (select topic from pgflow_tests.get_realtime_message('run:failed', (select run_id from run_ids))),
  concat('pgflow:run:', (select run_id from run_ids)),
  'The run:failed event should have the correct topic (pgflow:run:<run_id>)'
);

-- Test 4: Verify no step:completed events were sent for the failed step
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'first'),
  0::int,
  'pgflow.fail_task should NOT send any step:completed events for the failed step'
);

-- Test 5: Verify no run:completed events were sent
select is(
  pgflow_tests.count_realtime_events('run:completed', (select run_id from run_ids)),
  0::int,
  'pgflow.fail_task should NOT send any run:completed events when a run fails'
);

-- Test 6: Verify one step:failed event exists
select is(
  pgflow_tests.count_realtime_events('step:failed', (select run_id from run_ids), 'first'),
  1::int,
  'pgflow.fail_task should send a step:failed event when a step fails permanently'
);

-- Test 7: Verify step:failed event status
select is(
  (select payload->>'status' from pgflow_tests.get_realtime_message('step:failed', (select run_id from run_ids), 'first')),
  'failed',
  'The step:failed event should have status "failed"'
);

-- Test 8: Verify step:failed event contains error message
select is(
  (select payload->>'error_message' from pgflow_tests.get_realtime_message('step:failed', (select run_id from run_ids), 'first')),
  'Test failure message',
  'The step:failed event should contain the error message'
);

-- Test 9: Verify failed_at timestamp exists
select ok(
  (select (payload->>'failed_at')::timestamptz is not null
   from pgflow_tests.get_realtime_message('step:failed', (select run_id from run_ids), 'first')),
  'The step:failed event should include a failed_at timestamp'
);

-- Test 10: Verify event name formatting
select is(
  (select event from pgflow_tests.get_realtime_message('step:failed', (select run_id from run_ids), 'first')),
  'step:first:failed',
  'The step:failed event should have the correct event name (step:<slug>:failed)'
);

-- Clean up
drop table if exists run_ids;
drop table if exists failed_tasks;

select finish();
rollback;