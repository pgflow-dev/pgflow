begin;
select plan(5);
select pgflow_tests.reset_db();

-- Test: Map tasks correctly handle arrays containing arrays
select diag('Testing map tasks with nested arrays');

-- SETUP: Create flow with root map
select pgflow.create_flow('nested_arrays_flow');
select pgflow.add_step(
  flow_slug => 'nested_arrays_flow',
  step_slug => 'nested_map',
  deps_slugs => '{}',
  step_type => 'map'
);

-- Start flow with array of arrays
select run_id from pgflow.start_flow(
  'nested_arrays_flow',
  '[[1, 2], [3, 4, 5], [], ["a", "b", "c"], [{"id": 1}, {"id": 2}]]'::jsonb
) \gset

-- Verify 5 tasks were created (one per sub-array)
select is(
  (select count(*) from pgflow.step_tasks
   where run_id = :'run_id' and step_slug = 'nested_map'),
  5::bigint,
  'Should create 5 tasks for array with 5 sub-arrays'
);

-- Ensure worker exists
select pgflow_tests.ensure_worker('nested_arrays_flow');

-- Get message IDs for specific tasks
select message_id as msg_id_0 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'nested_map' and task_index = 0 \gset

select message_id as msg_id_1 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'nested_map' and task_index = 1 \gset

select message_id as msg_id_2 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'nested_map' and task_index = 2 \gset

select message_id as msg_id_3 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'nested_map' and task_index = 3 \gset

select message_id as msg_id_4 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'nested_map' and task_index = 4 \gset

-- TEST: Each task receives its complete sub-array
select is(
  (select input from pgflow.start_tasks(
    'nested_arrays_flow',
    ARRAY[:'msg_id_0'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  '[1, 2]'::jsonb,
  'Task 0 should receive first sub-array [1, 2]'
);

select is(
  (select input from pgflow.start_tasks(
    'nested_arrays_flow',
    ARRAY[:'msg_id_1'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  '[3, 4, 5]'::jsonb,
  'Task 1 should receive second sub-array [3, 4, 5]'
);

select is(
  (select input from pgflow.start_tasks(
    'nested_arrays_flow',
    ARRAY[:'msg_id_2'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  '[]'::jsonb,
  'Task 2 should receive empty sub-array []'
);

select is(
  (select input from pgflow.start_tasks(
    'nested_arrays_flow',
    ARRAY[:'msg_id_4'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  '[{"id": 1}, {"id": 2}]'::jsonb,
  'Task 4 should receive array of objects'
);

select finish();
rollback;