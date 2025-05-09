begin;
select plan(3);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

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
  select * from pgflow.poll_for_tasks('sequential', 1, 1)
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

-- Clean up
drop table if exists run_ids;
drop table if exists failed_tasks;

select finish();
rollback;