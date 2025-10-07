begin;
select plan(7);
select pgflow_tests.reset_db();

-- Test: Map -> Map chain where first map's output feeds second map
select diag('Testing map-to-map chain with array propagation');

-- SETUP: Create flow with map -> map chain
select pgflow.create_flow('map_chain_flow');
select pgflow.add_step(
  flow_slug => 'map_chain_flow',
  step_slug => 'first_map',
  deps_slugs => '{}',
  step_type => 'map'
);
select pgflow.add_step(
  flow_slug => 'map_chain_flow',
  step_slug => 'second_map',
  deps_slugs => ARRAY['first_map'],
  step_type => 'map'
);

-- Start flow with initial array
select run_id from pgflow.start_flow(
  'map_chain_flow',
  '[1, 2, 3]'::jsonb
) \gset

-- Verify first map has 3 tasks
select is(
  (select count(*) from pgflow.step_tasks
   where run_id = :'run_id' and step_slug = 'first_map'),
  3::bigint,
  'First map should have 3 tasks'
);

-- Ensure worker exists
select pgflow_tests.ensure_worker('map_chain_flow');

-- Start and verify first map tasks receive individual elements
select message_id as first_map_msg_0 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'first_map' and task_index = 0 \gset

select message_id as first_map_msg_1 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'first_map' and task_index = 1 \gset

select message_id as first_map_msg_2 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'first_map' and task_index = 2 \gset

select is(
  (select input from pgflow.start_tasks(
    'map_chain_flow',
    ARRAY[:'first_map_msg_0'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  '1'::jsonb,
  'First map task 0 should receive element 1'
);


select is(
  (select input from pgflow.start_tasks(
    'map_chain_flow',
    ARRAY[:'first_map_msg_1'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  '2'::jsonb,
  'First map task 1 should receive element 2'
);


-- NOTE: Can't complete first map tasks with non-array output because
-- complete_task validates that map steps must output arrays
-- This test will need to be updated once output aggregation is implemented

-- For now, just verify that the first map tasks are properly started
select is(
  (select count(*) from pgflow.step_tasks
   where run_id = :'run_id' and step_slug = 'first_map' and status = 'started'),
  2::bigint,  -- 2 because we started task 0 and 1 above
  'First map tasks 0 and 1 should be started'
);

-- Test what happens when we simulate the aggregated output being available
-- This is a preview of what SHOULD happen once aggregation is implemented

-- Create a new flow to test the expected behavior
select pgflow.create_flow('map_chain_test2');
select pgflow.add_step(
  flow_slug => 'map_chain_test2',
  step_slug => 'producer',
  deps_slugs => '{}',
  step_type => 'single'
);
select pgflow.add_step(
  flow_slug => 'map_chain_test2',
  step_slug => 'consumer_map',
  deps_slugs => ARRAY['producer'],
  step_type => 'map'
);

select run_id as run2_id from pgflow.start_flow('map_chain_test2', '{}'::jsonb) \gset

-- Complete producer with an array (simulating what aggregated map output would be)
with producer_task as (
  select * from pgflow_tests.read_and_start('map_chain_test2', 1, 1) limit 1
)
select pgflow.complete_task(
  (select run_id from producer_task),
  'producer',
  0,
  '[{"value": 10}, {"value": 20}, {"value": 30}]'::jsonb
)
from producer_task;

-- Now consumer_map should have been initialized with 3 tasks
select is(
  (select initial_tasks from pgflow.step_states
   where run_id = :'run2_id' and step_slug = 'consumer_map'),
  3,
  'Consumer map should have initial_tasks = 3'
);

-- Get message IDs for consumer_map tasks
select message_id as consumer_msg_0 from pgflow.step_tasks
where run_id = :'run2_id' and step_slug = 'consumer_map' and task_index = 0 \gset

select message_id as consumer_msg_1 from pgflow.step_tasks
where run_id = :'run2_id' and step_slug = 'consumer_map' and task_index = 1 \gset

-- Verify consumer_map tasks receive individual elements from the array
select is(
  (select input from pgflow.start_tasks(
    'map_chain_test2',
    ARRAY[:'consumer_msg_0'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  '{"value": 10}'::jsonb,
  'Consumer map task 0 should receive first element from producer array'
);

select is(
  (select input from pgflow.start_tasks(
    'map_chain_test2',
    ARRAY[:'consumer_msg_1'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  '{"value": 20}'::jsonb,
  'Consumer map task 1 should receive second element from producer array'
);

select finish();
rollback;