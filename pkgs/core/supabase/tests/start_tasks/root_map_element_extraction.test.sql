begin;
select plan(5);
select pgflow_tests.reset_db();

-- Test: Root map tasks receive individual array elements from run input
select diag('Testing root map tasks receive individual array elements');

-- SETUP: Create flow with root map step
select pgflow.create_flow('root_map_flow');
select pgflow.add_step(
  flow_slug => 'root_map_flow',
  step_slug => 'root_map',
  deps_slugs => '{}',
  step_type => 'map'
);

-- Start flow with array input
select run_id from pgflow.start_flow('root_map_flow', '["apple", "banana", "cherry"]'::jsonb) \gset

-- Verify 3 tasks were created
select is(
  (select count(*) from pgflow.step_tasks
   where run_id = :'run_id' and step_slug = 'root_map'),
  3::bigint,
  'Should create 3 tasks for array with 3 elements'
);

-- Ensure worker exists
select pgflow_tests.ensure_worker('root_map_flow');

-- Get message IDs for all tasks
select array_agg(message_id order by task_index) as msg_ids
from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'root_map' \gset

-- Get individual message IDs for each task
select message_id as msg_id_0 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'root_map' and task_index = 0 \gset

select message_id as msg_id_1 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'root_map' and task_index = 1 \gset

select message_id as msg_id_2 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'root_map' and task_index = 2 \gset

-- TEST: Call start_tasks for task 0 and verify input and task_index
select is(
  (select row(input, task_index) from pgflow.start_tasks(
    'root_map_flow',
    ARRAY[:'msg_id_0'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  row('"apple"'::jsonb, 0),
  'Task 0 should receive first array element (apple) with task_index = 0'
);

-- TEST: Call start_tasks for task 1 and verify input and task_index
select is(
  (select row(input, task_index) from pgflow.start_tasks(
    'root_map_flow',
    ARRAY[:'msg_id_1'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  row('"banana"'::jsonb, 1),
  'Task 1 should receive second array element (banana) with task_index = 1'
);

-- TEST: Call start_tasks for task 2 and verify input and task_index
select is(
  (select row(input, task_index) from pgflow.start_tasks(
    'root_map_flow',
    ARRAY[:'msg_id_2'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  row('"cherry"'::jsonb, 2),
  'Task 2 should receive third array element (cherry) with task_index = 2'
);

-- Verify all tasks got started
select is(
  (select count(*) from pgflow.step_tasks
   where run_id = :'run_id' and step_slug = 'root_map' and status = 'started'),
  3::bigint,
  'All 3 tasks should be in started status after start_tasks'
);

select finish();
rollback;