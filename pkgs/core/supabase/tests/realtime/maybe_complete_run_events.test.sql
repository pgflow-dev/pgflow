begin;
select plan(6);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database and setup a simple flow with just one step
select pgflow_tests.reset_db();
select pgflow.create_flow('simple');
select pgflow.add_step('simple', 'only_step');

-- Start the flow and capture the run_id
with flow as (
  select * from pgflow.start_flow('simple', '{"test_data": "value"}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Poll for the task and complete it
-- This should trigger maybe_complete_run internally
with task as (
  select * from pgflow.poll_for_tasks('simple', 1, 1)
)
select pgflow.complete_task(
  (select run_id from task),
  (select step_slug from task),
  0,
  '{"result": "success"}'::jsonb
) into temporary completed_tasks;

-- Test 1: Verify one run:completed event exists
select is(
  pgflow_tests.count_realtime_events('run:completed', (select run_id from run_ids)),
  1::int,
  'pgflow.maybe_complete_run should send exactly one run:completed event'
);

-- Test 2: Verify flow_slug in event payload
select is(
  (select payload->>'flow_slug' from pgflow_tests.get_realtime_message('run:completed', (select run_id from run_ids))),
  'simple',
  'The run:completed event should contain the correct flow_slug'
);

-- Test 3: Verify status in event payload
select is(
  (select payload->>'status' from pgflow_tests.get_realtime_message('run:completed', (select run_id from run_ids))),
  'completed',
  'The run:completed event should have status "completed"'
);

-- Test 4: Verify completed_at timestamp exists and is valid
select ok(
  (select (payload->>'completed_at')::timestamptz is not null
   from pgflow_tests.get_realtime_message('run:completed', (select run_id from run_ids))),
  'The run:completed event should include a completed_at timestamp'
);

-- Test 5: Verify topic formatting
select is(
  (select topic from pgflow_tests.get_realtime_message('run:completed', (select run_id from run_ids))),
  concat('pgflow:run:', (select run_id from run_ids)),
  'The run:completed event should have the correct topic (pgflow:run:<run_id>)'
);

-- Test 6: Verify no run:failed events were sent
select is(
  pgflow_tests.count_realtime_events('run:failed', (select run_id from run_ids)),
  0::int,
  'pgflow.maybe_complete_run should NOT send any run:failed events on successful completion'
);

-- Clean up
drop table if exists run_ids;
drop table if exists completed_tasks;

select finish();
rollback;