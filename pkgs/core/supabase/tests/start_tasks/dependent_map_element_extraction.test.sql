begin;
select plan(7);
select pgflow_tests.reset_db();

-- Test: Dependent map tasks receive individual array elements from predecessor
select diag('Testing dependent map tasks receive elements from predecessor output');

-- SETUP: Create flow with single step -> map step
select pgflow.create_flow('dep_map_flow');
select pgflow.add_step(
  flow_slug => 'dep_map_flow',
  step_slug => 'producer_step',
  deps_slugs => '{}',
  step_type => 'single'
);
select pgflow.add_step(
  flow_slug => 'dep_map_flow',
  step_slug => 'map_consumer',
  deps_slugs => ARRAY['producer_step'],
  step_type => 'map'
);

-- Start flow with some input
select run_id from pgflow.start_flow('dep_map_flow', '{"initial": "data"}'::jsonb) \gset

-- Verify producer step was created and has a task
select is(
  (select count(*) from pgflow.step_tasks
   where run_id = :'run_id' and step_slug = 'producer_step'),
  1::bigint,
  'Producer step should have 1 task'
);

-- Ensure worker exists
select pgflow_tests.ensure_worker('dep_map_flow');

-- Start and complete the producer task with array output
with producer_task as (
  select * from pgflow_tests.read_and_start('dep_map_flow', 1, 1) limit 1
)
select pgflow.complete_task(
  (select run_id from producer_task),
  'producer_step',
  0,
  '[10, 20, 30, 40]'::jsonb  -- Array output from producer
)
from producer_task;

-- Verify producer step is completed
select is(
  (select status from pgflow.step_states
   where run_id = :'run_id' and step_slug = 'producer_step'),
  'completed',
  'Producer step should be completed'
);

-- Verify map_consumer initial_tasks was set to 4
select is(
  (select initial_tasks from pgflow.step_states
   where run_id = :'run_id' and step_slug = 'map_consumer'),
  4,
  'Map consumer should have initial_tasks = 4 (array length)'
);

-- Verify 4 tasks were created for map_consumer
select is(
  (select count(*) from pgflow.step_tasks
   where run_id = :'run_id' and step_slug = 'map_consumer'),
  4::bigint,
  'Should create 4 tasks for map step'
);

-- Get message IDs for each map task
select message_id as msg_id_0 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'map_consumer' and task_index = 0 \gset

select message_id as msg_id_1 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'map_consumer' and task_index = 1 \gset

select message_id as msg_id_2 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'map_consumer' and task_index = 2 \gset

select message_id as msg_id_3 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'map_consumer' and task_index = 3 \gset

-- TEST: Each map task receives its specific element from producer output
select is(
  (select input from pgflow.start_tasks(
    'dep_map_flow',
    ARRAY[:'msg_id_0'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  '10'::jsonb,
  'Task 0 should receive first element (10) from producer_step'
);

select is(
  (select input from pgflow.start_tasks(
    'dep_map_flow',
    ARRAY[:'msg_id_1'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  '20'::jsonb,
  'Task 1 should receive second element (20) from producer_step'
);

select is(
  (select input from pgflow.start_tasks(
    'dep_map_flow',
    ARRAY[:'msg_id_3'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  '40'::jsonb,
  'Task 3 should receive fourth element (40) from producer_step'
);

select finish();
rollback;