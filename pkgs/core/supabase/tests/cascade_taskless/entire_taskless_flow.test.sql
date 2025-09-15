begin;
select plan(10);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database
select pgflow_tests.reset_db();

-- Create a flow with only taskless steps (simulating validation -> route -> log pattern)
select pgflow.create_flow('test_entire_taskless');

-- First taskless step (validation - empty map)
select pgflow.add_step(
  flow_slug => 'test_entire_taskless',
  step_slug => 'validate',
  step_type => 'map'
);

-- Second taskless step (routing - empty map)
select pgflow.add_step(
  flow_slug => 'test_entire_taskless',
  step_slug => 'route',
  deps_slugs => array['validate'],
  step_type => 'map'
);

-- Third taskless step (logging - empty map)
select pgflow.add_step(
  flow_slug => 'test_entire_taskless',
  step_slug => 'log',
  deps_slugs => array['route'],
  step_type => 'map'
);

-- Start the flow with empty array - entire flow should complete synchronously
with flow as (
  select * from pgflow.start_flow('test_entire_taskless', '[]'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1-3: All steps should be completed
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'validate'),
  'completed',
  'Validate step should be completed'
);

select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'route'),
  'completed',
  'Route step should be completed'
);

select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'log'),
  'completed',
  'Log step should be completed'
);

-- Test 4: Run should be completed
select is(
  (select status from pgflow.runs
   where run_id = (select run_id from run_ids)),
  'completed',
  'Entire run should be completed synchronously'
);

-- Test 5: Run should have remaining_steps = 0
select is(
  (select remaining_steps from pgflow.runs
   where run_id = (select run_id from run_ids)),
  0,
  'Run should have no remaining steps'
);

-- Test 6: Run should have completed_at timestamp
select ok(
  (select completed_at is not null from pgflow.runs
   where run_id = (select run_id from run_ids)),
  'Run should have completed_at timestamp'
);

-- Test 7-9: All steps should have sent step:completed events
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'validate'),
  1::int,
  'Validate step should send step:completed event'
);

select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'route'),
  1::int,
  'Route step should send step:completed event'
);

select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'log'),
  1::int,
  'Log step should send step:completed event'
);

-- Test 10: No step:started events should be sent
select is(
  pgflow_tests.count_realtime_events('step:started', (select run_id from run_ids), null),
  0::int,
  'No step:started events should be sent for taskless flow'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;