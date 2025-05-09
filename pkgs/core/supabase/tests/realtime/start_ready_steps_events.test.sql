begin;
select plan(6);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database and setup a sequential flow with dependencies
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential'); -- This creates first -> second -> last steps

-- Start the flow and capture the run_id
with flow as (
  select * from pgflow.start_flow('sequential', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Poll for the first task and complete it
-- This should trigger start_ready_steps internally for the 'second' step
with task as (
  select * from pgflow.poll_for_tasks('sequential', 1, 1)
)
select pgflow.complete_task(
  (select run_id from task),
  (select step_slug from task),
  0,
  '{"result": "success"}'::jsonb
) into temporary completed_tasks;

-- Test 1: Verify one step:started event exists for the second step
select is(
  pgflow_tests.count_realtime_events('step:started', (select run_id from run_ids), 'second'),
  1::int,
  'pgflow.start_ready_steps should send exactly one step:started event for newly ready step'
);

-- Test 2: Verify the step_slug is in the event payload
select is(
  (select payload->>'step_slug' from pgflow_tests.get_realtime_message('step:started', (select run_id from run_ids), 'second')),
  'second',
  'The step:started event should contain the correct step_slug'
);

-- Test 3: Verify status in event payload
select is(
  (select payload->>'status' from pgflow_tests.get_realtime_message('step:started', (select run_id from run_ids), 'second')),
  'started',
  'The step:started event should have status "started"'
);

-- Test 4: Verify started_at timestamp exists and is valid
select ok(
  (select (payload->>'started_at')::timestamptz is not null 
   from pgflow_tests.get_realtime_message('step:started', (select run_id from run_ids), 'second')),
  'The step:started event should include a started_at timestamp'
);

-- Test 5: Verify step:started event name formatting
select is(
  (select event from pgflow_tests.get_realtime_message('step:started', (select run_id from run_ids), 'second')),
  'step:second:started',
  'The step:started event should have the correct event name (step:<slug>:started)'
);

-- Test 6: Verify topic formatting
select is(
  (select topic from pgflow_tests.get_realtime_message('step:started', (select run_id from run_ids), 'second')),
  concat('pgflow:run:', (select run_id from run_ids)),
  'The step:started event should have the correct topic (pgflow:run:<run_id>)'
);

-- Clean up
drop table if exists run_ids;
drop table if exists completed_tasks;

select finish();
rollback;