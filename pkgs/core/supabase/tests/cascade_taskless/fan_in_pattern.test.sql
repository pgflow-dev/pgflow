begin;
select plan(11);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database
select pgflow_tests.reset_db();

-- Create a flow with fan-in pattern: two normal steps converging on taskless step
select pgflow.create_flow('test_fan_in');

-- First normal step
select pgflow.add_step(
  flow_slug => 'test_fan_in',
  step_slug => 'normal_a',
  step_type => 'single'
);

-- Second normal step
select pgflow.add_step(
  flow_slug => 'test_fan_in',
  step_slug => 'normal_b',
  step_type => 'single'
);

-- Intermediate single step to converge the two branches
select pgflow.add_step(
  flow_slug => 'test_fan_in',
  step_slug => 'converge',
  deps_slugs => array['normal_a', 'normal_b'],
  step_type => 'single'
);

-- Taskless map step depending on the converge step
select pgflow.add_step(
  flow_slug => 'test_fan_in',
  step_slug => 'taskless_converge',
  deps_slugs => array['converge'],
  step_type => 'map'
);

-- Another taskless step in chain
select pgflow.add_step(
  flow_slug => 'test_fan_in',
  step_slug => 'taskless_next',
  deps_slugs => array['taskless_converge'],
  step_type => 'map'
);

-- Final normal step
select pgflow.add_step(
  flow_slug => 'test_fan_in',
  step_slug => 'normal_final',
  deps_slugs => array['taskless_next'],
  step_type => 'single'
);

-- Start the flow
with flow as (
  select * from pgflow.start_flow('test_fan_in', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1-2: Verify both normal steps are started
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'normal_a'),
  'started',
  'First normal step should be started'
);

select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'normal_b'),
  'started',
  'Second normal step should be started'
);

-- Test 3-4: Verify converge step is waiting (deps not satisfied)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'converge'),
  'created',
  'Converge step should be waiting for dependencies'
);

select is(
  (select remaining_deps from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'converge'),
  2,
  'Converge step should have 2 remaining dependencies'
);

-- Complete first normal step with empty array output
select pgflow.complete_task(
  task => jsonb_build_object(
    'flow_slug', 'test_fan_in',
    'run_id', (select run_id from run_ids),
    'step_slug', 'normal_a',
    'task_index', 0
  ),
  output => '[]'::jsonb
);

-- Test 5: Converge step should still be waiting (one dep remaining)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'converge'),
  'created',
  'Converge step should still be waiting after one dep completes'
);

select is(
  (select remaining_deps from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'converge'),
  1,
  'Converge step should have 1 remaining dependency'
);

-- Complete second normal step with empty array output
select pgflow.complete_task(
  task => jsonb_build_object(
    'flow_slug', 'test_fan_in',
    'run_id', (select run_id from run_ids),
    'step_slug', 'normal_b',
    'task_index', 0
  ),
  output => '[]'::jsonb
);

-- Test 7: Converge step should be started
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'converge'),
  'started',
  'Converge step should be started when all deps satisfied'
);

-- Complete the converge step with empty array to trigger cascade
select pgflow.complete_task(
  task => jsonb_build_object(
    'flow_slug', 'test_fan_in',
    'run_id', (select run_id from run_ids),
    'step_slug', 'converge',
    'task_index', 0
  ),
  output => '[]'::jsonb
);

-- Test 8: Both taskless steps should cascade complete
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'taskless_converge'),
  'completed',
  'Taskless converge step should complete after converge outputs empty array'
);

select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'taskless_next'),
  'completed',
  'Next taskless step should cascade complete'
);

-- Test 10: Final normal step should be started
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids)
   and step_slug = 'normal_final'),
  'started',
  'Final normal step should be started after cascade'
);

-- Test 11: Verify events were sent for cascaded steps
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'taskless_converge') +
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'taskless_next'),
  2::int,
  'Both taskless steps should send step:completed events'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;