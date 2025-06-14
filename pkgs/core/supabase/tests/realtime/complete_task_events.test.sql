begin;
select plan(9);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database and setup a sequential flow
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- Start the flow and capture the run_id
with flow as (
  select * from pgflow.start_flow('sequential', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Poll for a task and complete it
with task as (
  select * from pgflow_tests.read_and_start('sequential', 1, 1)
)
select pgflow.complete_task(
  (select run_id from task),
  (select step_slug from task),
  0,
  '{"result": "success"}'::jsonb
) into temporary completed_tasks;

-- Test 1: Verify one step:completed event exists
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'first'),
  1::int,
  'pgflow.complete_task should send exactly one step:completed event'
);

-- Test 2: Verify the step_slug is in the event payload
select is(
  (select payload->>'step_slug' from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'first')),
  'first',
  'The step:completed event should contain the correct step_slug'
);

-- Test 3: Verify status in event payload
select is(
  (select payload->>'status' from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'first')),
  'completed',
  'The step:completed event should have status "completed"'
);

-- Test 4: Verify completed_at timestamp exists and is valid
select ok(
  (select (payload->>'completed_at')::timestamptz is not null
   from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'first')),
  'The step:completed event should include a completed_at timestamp'
);

-- Test 5: Verify output data is included in payload
select is(
  (select payload->'output'->>'result'
   from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'first')),
  'success',
  'The step:completed event should contain the correct output data'
);

-- Test 6: Verify event name formatting
select is(
  (select event from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'first')),
  'step:first:completed',
  'The step:completed event should have the correct event name (step:<slug>:completed)'
);

-- Test 7: Verify topic formatting
select is(
  (select topic from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'first')),
  concat('pgflow:run:', (select run_id from run_ids)),
  'The step:completed event should have the correct topic (pgflow:run:<run_id>)'
);

-- Test 8: Verify no step:failed events were sent for the completed step
select is(
  pgflow_tests.count_realtime_events('step:failed', (select run_id from run_ids), 'first'),
  0::int,
  'pgflow.complete_task should NOT send any step:failed events'
);

-- Test 9: Verify no run:completed event was sent (since there are more steps to complete)
select is(
  pgflow_tests.count_realtime_events('run:completed', (select run_id from run_ids)),
  0::int,
  'pgflow.complete_task should NOT send run:completed event when steps remain incomplete'
);

-- Clean up
drop table if exists run_ids;
drop table if exists completed_tasks;

select finish();
rollback;