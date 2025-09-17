begin;
select plan(6);
select pgflow_tests.reset_db();

-- Test: Map tasks correctly handle arrays with mixed JSON types
select diag('Testing map tasks with mixed type arrays');

-- SETUP: Create flow with root map
select pgflow.create_flow('mixed_types_flow');
select pgflow.add_step(
  flow_slug => 'mixed_types_flow',
  step_slug => 'mixed_map',
  deps_slugs => '{}',
  step_type => 'map'
);

-- Start flow with array containing different JSON types
-- String, number, object, boolean, null
select run_id from pgflow.start_flow(
  'mixed_types_flow',
  '["text value", 42, {"key": "value", "nested": {"id": 1}}, true, null]'::jsonb
) \gset

-- Verify 5 tasks were created
select is(
  (select count(*) from pgflow.step_tasks
   where run_id = :'run_id' and step_slug = 'mixed_map'),
  5::bigint,
  'Should create 5 tasks for array with 5 elements'
);

-- Ensure worker exists
select pgflow_tests.ensure_worker('mixed_types_flow');

-- Get message IDs for each task
select message_id as msg_id_0 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'mixed_map' and task_index = 0 \gset

select message_id as msg_id_1 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'mixed_map' and task_index = 1 \gset

select message_id as msg_id_2 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'mixed_map' and task_index = 2 \gset

select message_id as msg_id_3 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'mixed_map' and task_index = 3 \gset

select message_id as msg_id_4 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'mixed_map' and task_index = 4 \gset

-- TEST: Verify each task receives the correct type
select is(
  (select input from pgflow.start_tasks(
    'mixed_types_flow',
    ARRAY[:'msg_id_0'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  '"text value"'::jsonb,
  'Task 0 should receive string element'
);

select is(
  (select input from pgflow.start_tasks(
    'mixed_types_flow',
    ARRAY[:'msg_id_1'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  '42'::jsonb,
  'Task 1 should receive number element'
);

select is(
  (select input from pgflow.start_tasks(
    'mixed_types_flow',
    ARRAY[:'msg_id_2'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  '{"key": "value", "nested": {"id": 1}}'::jsonb,
  'Task 2 should receive object element with nested structure'
);

select is(
  (select input from pgflow.start_tasks(
    'mixed_types_flow',
    ARRAY[:'msg_id_3'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  'true'::jsonb,
  'Task 3 should receive boolean element'
);

select is(
  (select input from pgflow.start_tasks(
    'mixed_types_flow',
    ARRAY[:'msg_id_4'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  'null'::jsonb,
  'Task 4 should receive null element'
);

select finish();
rollback;