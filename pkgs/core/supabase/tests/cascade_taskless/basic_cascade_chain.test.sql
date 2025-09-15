begin;
select plan(14);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database
select pgflow_tests.reset_db();

-- Create a flow with a chain of taskless steps (empty map steps)
select pgflow.create_flow('test_cascade_chain');

-- First taskless step (root map with empty array)
select pgflow.add_step(
  flow_slug => 'test_cascade_chain',
  step_slug => 'taskless_1',
  step_type => 'map'
);

-- Second taskless step (map depending on first)
select pgflow.add_step(
  flow_slug => 'test_cascade_chain',
  step_slug => 'taskless_2',
  deps_slugs => array['taskless_1'],
  step_type => 'map'
);

-- Third taskless step (map depending on second)
select pgflow.add_step(
  flow_slug => 'test_cascade_chain',
  step_slug => 'taskless_3',
  deps_slugs => array['taskless_2'],
  step_type => 'map'
);

-- Normal step at the end
select pgflow.add_step(
  flow_slug => 'test_cascade_chain',
  step_slug => 'normal_step',
  deps_slugs => array['taskless_3'],
  step_type => 'single'
);

-- Start the flow with an empty array - should cascade complete all taskless steps
with flow as (
  select * from pgflow.start_flow('test_cascade_chain', '[]'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1-3: Verify all taskless steps are completed
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'taskless_1'),
  'completed',
  'First taskless step should be completed'
);

select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'taskless_2'),
  'completed',
  'Second taskless step should be completed (cascade)'
);

select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'taskless_3'),
  'completed',
  'Third taskless step should be completed (cascade)'
);

-- Test 4: Verify normal step is started (not completed)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'normal_step'),
  'started',
  'Normal step should be started after cascade'
);

-- Test 5-7: Verify remaining_tasks = 0 for all taskless steps
select is(
  (select remaining_tasks from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'taskless_1'),
  0,
  'First taskless step should have remaining_tasks = 0'
);

select is(
  (select remaining_tasks from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'taskless_2'),
  0,
  'Second taskless step should have remaining_tasks = 0'
);

select is(
  (select remaining_tasks from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'taskless_3'),
  0,
  'Third taskless step should have remaining_tasks = 0'
);

-- Test 8-10: Verify step:completed events were sent for all taskless steps
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'taskless_1'),
  1::int,
  'First taskless step should send step:completed event'
);

select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'taskless_2'),
  1::int,
  'Second taskless step should send step:completed event'
);

select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'taskless_3'),
  1::int,
  'Third taskless step should send step:completed event'
);

-- Test 11-13: Verify NO step:started events for taskless steps
select is(
  pgflow_tests.count_realtime_events('step:started', (select run_id from run_ids), 'taskless_1'),
  0::int,
  'First taskless step should NOT send step:started event'
);

select is(
  pgflow_tests.count_realtime_events('step:started', (select run_id from run_ids), 'taskless_2'),
  0::int,
  'Second taskless step should NOT send step:started event'
);

select is(
  pgflow_tests.count_realtime_events('step:started', (select run_id from run_ids), 'taskless_3'),
  0::int,
  'Third taskless step should NOT send step:started event'
);

-- Test 14: Verify normal step got step:started event
select is(
  pgflow_tests.count_realtime_events('step:started', (select run_id from run_ids), 'normal_step'),
  1::int,
  'Normal step should send step:started event'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;