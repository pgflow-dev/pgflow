begin;
select plan(7);

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

-- Test 1: Verify one step:started event exists for the root step
select is(
  pgflow_tests.count_realtime_events('step:started', (select run_id from run_ids), 'first'),
  1::int,
  'pgflow.start_ready_steps should send exactly one step:started event for root step'
);

-- Test 2: Verify step_slug in event payload
select is(
  (select payload->>'step_slug' from pgflow_tests.get_realtime_message('step:started', (select run_id from run_ids), 'first')),
  'first',
  'The step:started event should contain the correct step_slug'
);

-- Test 3: Verify status in event payload
select is(
  (select payload->>'status' from pgflow_tests.get_realtime_message('step:started', (select run_id from run_ids), 'first')),
  'started',
  'The step:started event should have status "started"'
);

-- Test 4: Verify started_at timestamp exists and is valid
select ok(
  (select (payload->>'started_at')::timestamptz is not null
   from pgflow_tests.get_realtime_message('step:started', (select run_id from run_ids), 'first')),
  'The step:started event should include a started_at timestamp'
);

-- Test 5: Verify remaining_tasks in payload
select ok(
  (select (payload->>'remaining_tasks')::int > 0
   from pgflow_tests.get_realtime_message('step:started', (select run_id from run_ids), 'first')),
  'The step:started event should include remaining_tasks count'
);

-- Test 6: Verify event name formatting
select is(
  (select event from pgflow_tests.get_realtime_message('step:started', (select run_id from run_ids), 'first')),
  'step:first:started',
  'The step:started event should have the correct event name (step:<slug>:started)'
);

-- Test 7: Verify topic formatting
select is(
  (select topic from pgflow_tests.get_realtime_message('step:started', (select run_id from run_ids), 'first')),
  concat('pgflow:run:', (select run_id from run_ids)),
  'The step:started event should have the correct topic (pgflow:run:<run_id>)'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
