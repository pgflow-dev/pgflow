begin;
select plan(12);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database
select pgflow_tests.reset_db();

-- Create a mixed flow: normal -> taskless -> taskless -> normal -> taskless
select pgflow.create_flow('test_mixed');

-- Normal step A
select pgflow.add_step(
  flow_slug => 'test_mixed',
  step_slug => 'normal_a',
  step_type => 'single'
);

-- Taskless step B (depends on normal A)
select pgflow.add_step(
  flow_slug => 'test_mixed',
  step_slug => 'taskless_b',
  deps_slugs => array['normal_a'],
  step_type => 'map'
);

-- Taskless step C (depends on taskless B)
select pgflow.add_step(
  flow_slug => 'test_mixed',
  step_slug => 'taskless_c',
  deps_slugs => array['taskless_b'],
  step_type => 'map'
);

-- Normal step D (depends on taskless C)
select pgflow.add_step(
  flow_slug => 'test_mixed',
  step_slug => 'normal_d',
  deps_slugs => array['taskless_c'],
  step_type => 'single'
);

-- Taskless step E (depends on normal D)
select pgflow.add_step(
  flow_slug => 'test_mixed',
  step_slug => 'taskless_e',
  deps_slugs => array['normal_d'],
  step_type => 'map'
);

-- Start the flow
with flow as (
  select * from pgflow.start_flow('test_mixed', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: Normal A should be started
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'normal_a'),
  'started',
  'Normal step A should be started'
);

-- Test 2-3: Taskless steps should be waiting
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'taskless_b'),
  'created',
  'Taskless step B should be waiting'
);

select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'taskless_c'),
  'created',
  'Taskless step C should be waiting'
);

-- Complete normal A with empty array (triggers first cascade)
select pgflow.complete_task(
  task => jsonb_build_object(
    'flow_slug', 'test_mixed',
    'run_id', (select run_id from run_ids),
    'step_slug', 'normal_a',
    'task_index', 0
  ),
  output => '[]'::jsonb
);

-- Test 4-5: Taskless B and C should cascade complete
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'taskless_b'),
  'completed',
  'Taskless step B should cascade complete'
);

select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'taskless_c'),
  'completed',
  'Taskless step C should cascade complete'
);

-- Test 6: Normal D should be started
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'normal_d'),
  'started',
  'Normal step D should be started after cascade'
);

-- Test 7: Taskless E should still be waiting
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'taskless_e'),
  'created',
  'Taskless step E should be waiting for normal D'
);

-- Complete normal D with empty array (triggers second cascade)
select pgflow.complete_task(
  task => jsonb_build_object(
    'flow_slug', 'test_mixed',
    'run_id', (select run_id from run_ids),
    'step_slug', 'normal_d',
    'task_index', 0
  ),
  output => '[]'::jsonb
);

-- Test 8: Taskless E should complete
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'taskless_e'),
  'completed',
  'Taskless step E should complete instantly'
);

-- Test 9: Run should be completed (all steps done)
select is(
  (select status from pgflow.runs
   where run_id = (select run_id from run_ids)),
  'completed',
  'Run should be completed after all steps finish'
);

-- Test 10-12: Verify events for taskless steps
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'taskless_b'),
  1::int,
  'Taskless B should send step:completed event'
);

select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'taskless_c'),
  1::int,
  'Taskless C should send step:completed event'
);

select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'taskless_e'),
  1::int,
  'Taskless E should send step:completed event'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;