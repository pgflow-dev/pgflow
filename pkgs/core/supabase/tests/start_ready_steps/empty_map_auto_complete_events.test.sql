begin;
select plan(10);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database
select pgflow_tests.reset_db();

-- Create a flow with a root map step and a dependent step
select pgflow.create_flow('test_empty_map_events');
select pgflow.add_step(
  flow_slug => 'test_empty_map_events',
  step_slug => 'root_map_step',
  step_type => 'map'
);
select pgflow.add_step(
  flow_slug => 'test_empty_map_events',
  step_slug => 'dependent_step',
  deps_slugs => array['root_map_step'],
  step_type => 'single'
);

-- Start the flow with an empty array - this should auto-complete the map step
with flow as (
  select * from pgflow.start_flow('test_empty_map_events', '[]'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: Verify a step:completed event was sent for the empty map step
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'root_map_step'),
  1::int,
  'Empty array map step should send exactly one step:completed event'
);

-- Test 2: Verify NO step:started event was sent (it went directly to completed)
select is(
  pgflow_tests.count_realtime_events('step:started', (select run_id from run_ids), 'root_map_step'),
  0::int,
  'Empty array map step should NOT send step:started event (goes directly to completed)'
);

-- Test 3: Verify the step_slug in the completed event
select is(
  (select payload->>'step_slug' from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'root_map_step')),
  'root_map_step',
  'The step:completed event should contain the correct step_slug'
);

-- Test 4: Verify status in event payload
select is(
  (select payload->>'status' from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'root_map_step')),
  'completed',
  'The step:completed event should have status "completed"'
);

-- Test 5: Verify both started_at and completed_at timestamps exist and are equal
select ok(
  (select (payload->>'started_at')::timestamptz = (payload->>'completed_at')::timestamptz
   from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'root_map_step')),
  'Empty map step should have started_at = completed_at (instantaneous completion)'
);

-- Test 6: Verify output is an empty array
select is(
  (select payload->'output'::text
   from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'root_map_step')),
  '[]',
  'The step:completed event should have empty array as output'
);

-- Test 7: Verify remaining_tasks is 0
select is(
  (select (payload->>'remaining_tasks')::int
   from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'root_map_step')),
  0,
  'The step:completed event should have remaining_tasks = 0'
);

-- Test 8: Verify event name formatting
select is(
  (select event from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'root_map_step')),
  'step:root_map_step:completed',
  'The event should have correct name format (step:<slug>:completed)'
);

-- Test 9: Verify topic formatting
select is(
  (select topic from pgflow_tests.get_realtime_message('step:completed', (select run_id from run_ids), 'root_map_step')),
  concat('pgflow:run:', (select run_id from run_ids)),
  'The event should have correct topic format (pgflow:run:<run_id>)'
);

-- Test 10: Verify the dependent step was also started (cascade effect)
select is(
  pgflow_tests.count_realtime_events('step:started', (select run_id from run_ids), 'dependent_step'),
  1::int,
  'Completing the empty map step should trigger the dependent step to start'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;