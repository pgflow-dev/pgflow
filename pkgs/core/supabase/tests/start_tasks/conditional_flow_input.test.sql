begin;
select plan(6);
select pgflow_tests.reset_db();

-- =========================================================================
-- Test: Conditional flow_input in start_tasks
--
-- Only root non-map steps receive flow_input.
-- All other step types (root map, dependent non-map, dependent map) get NULL.
-- This optimization prevents data duplication for large array processing.
-- =========================================================================

-- Test 1: Root non-map step receives flow_input
select pgflow.create_flow('root_step_flow');
select pgflow.add_step('root_step_flow', 'root_step');
select pgflow.start_flow('root_step_flow', '{"user_id": "abc123"}'::jsonb);

select pgflow_tests.ensure_worker('root_step_flow');

with msgs as (
  select * from pgmq.read_with_poll('root_step_flow', 10, 5, 1, 50) limit 1
),
msg_ids as (
  select array_agg(msg_id) as ids from msgs
),
started_tasks as (
  select * from pgflow.start_tasks(
    'root_step_flow',
    (select ids from msg_ids),
    '11111111-1111-1111-1111-111111111111'::uuid
  )
)
select is(
  (select flow_input from started_tasks),
  '{"user_id": "abc123"}'::jsonb,
  'Root non-map step should receive flow_input'
);

-- Test 2: Dependent non-map step receives NULL flow_input
select pgflow_tests.reset_db();
select pgflow.create_flow('dep_flow');
select pgflow.add_step('dep_flow', 'first');
select pgflow.add_step('dep_flow', 'second', ARRAY['first']);
select pgflow.start_flow('dep_flow', '{"original": "input"}'::jsonb);

select pgflow_tests.ensure_worker('dep_flow');

-- Complete first step
with poll_result as (
  select * from pgflow_tests.read_and_start('dep_flow', 1, 1)
)
select pgflow.complete_task(
  run_id,
  step_slug,
  task_index,
  '{"first_result": "done"}'::jsonb
) from poll_result;

-- Start second step and verify flow_input is NULL
select pgflow_tests.ensure_worker('dep_flow', '22222222-2222-2222-2222-222222222222'::uuid);
with msgs as (
  select * from pgmq.read_with_poll('dep_flow', 10, 5, 1, 50) limit 1
),
msg_ids as (
  select array_agg(msg_id) as ids from msgs
),
started_tasks as (
  select * from pgflow.start_tasks(
    'dep_flow',
    (select ids from msg_ids),
    '22222222-2222-2222-2222-222222222222'::uuid
  )
)
select is(
  (select flow_input from started_tasks),
  NULL::jsonb,
  'Dependent non-map step should receive NULL flow_input (lazy loaded)'
);

-- Test 3: Root map step receives NULL flow_input
-- (flowInput IS the array, useless to include - workers get element via task.input)
select pgflow_tests.reset_db();
select pgflow.create_flow('root_map_flow');
select pgflow.add_step('root_map_flow', 'map_step', '{}', null, null, null, null, 'map');
select pgflow.start_flow('root_map_flow', '[1, 2, 3]'::jsonb);

select pgflow_tests.ensure_worker('root_map_flow');

with msgs as (
  select * from pgmq.read_with_poll('root_map_flow', 10, 5, 3, 50) limit 1
),
msg_ids as (
  select array_agg(msg_id) as ids from msgs
),
started_tasks as (
  select * from pgflow.start_tasks(
    'root_map_flow',
    (select ids from msg_ids),
    '11111111-1111-1111-1111-111111111111'::uuid
  )
)
select is(
  (select flow_input from started_tasks limit 1),
  NULL::jsonb,
  'Root map step should receive NULL flow_input (flowInput is the array itself)'
);

-- Test 4: Dependent map step receives NULL flow_input
select pgflow_tests.reset_db();
select pgflow.create_flow('dep_map_flow');
select pgflow.add_step('dep_map_flow', 'fetch_items', '{}', null, null, null, null, 'single');
select pgflow.add_step('dep_map_flow', 'process_item', ARRAY['fetch_items'], null, null, null, null, 'map');
select pgflow.start_flow('dep_map_flow', '{"config": "value"}'::jsonb);

select pgflow_tests.ensure_worker('dep_map_flow');

-- Complete first step with array
with poll_result as (
  select * from pgflow_tests.read_and_start('dep_map_flow', 1, 1)
)
select pgflow.complete_task(
  run_id,
  step_slug,
  task_index,
  '["a", "b", "c"]'::jsonb
) from poll_result;

-- Start map step and verify flow_input is NULL
select pgflow_tests.ensure_worker('dep_map_flow', '33333333-3333-3333-3333-333333333333'::uuid);
with msgs as (
  select * from pgmq.read_with_poll('dep_map_flow', 10, 5, 3, 50) limit 1
),
msg_ids as (
  select array_agg(msg_id) as ids from msgs
),
started_tasks as (
  select * from pgflow.start_tasks(
    'dep_map_flow',
    (select ids from msg_ids),
    '33333333-3333-3333-3333-333333333333'::uuid
  )
)
select is(
  (select flow_input from started_tasks limit 1),
  NULL::jsonb,
  'Dependent map step should receive NULL flow_input (lazy loaded)'
);

-- Test 5: Multiple parallel root non-map steps all receive flow_input
select pgflow_tests.reset_db();
select pgflow.create_flow('parallel_flow');
select pgflow.add_step('parallel_flow', 'step1');
select pgflow.add_step('parallel_flow', 'step2');  -- parallel step, no deps
select pgflow.start_flow('parallel_flow', '{"batch": "test"}'::jsonb);

select pgflow_tests.ensure_worker('parallel_flow');

with msgs as (
  select * from pgmq.read_with_poll('parallel_flow', 10, 5, 2, 50)
),
msg_ids as (
  select array_agg(msg_id) as ids from msgs
),
started_tasks as (
  select * from pgflow.start_tasks(
    'parallel_flow',
    (select ids from msg_ids),
    '11111111-1111-1111-1111-111111111111'::uuid
  )
)
select ok(
  (select bool_and(flow_input = '{"batch": "test"}'::jsonb) from started_tasks),
  'All parallel root non-map steps should receive flow_input'
);

-- Test 6: Mixed batch - only root non-map steps receive flow_input
-- This tests a complex scenario with different step types in same batch
select pgflow_tests.reset_db();
select pgflow.create_flow('mixed_flow');
select pgflow.add_step('mixed_flow', 'root_single');  -- root non-map
select pgflow.add_step('mixed_flow', 'root_array');   -- root non-map (array is just single that returns array)
select pgflow.start_flow('mixed_flow', '{"data": "value"}'::jsonb);

select pgflow_tests.ensure_worker('mixed_flow');

-- Both are root non-map steps, both should get flow_input
with msgs as (
  select * from pgmq.read_with_poll('mixed_flow', 10, 5, 2, 50)
),
msg_ids as (
  select array_agg(msg_id) as ids from msgs
),
started_tasks as (
  select * from pgflow.start_tasks(
    'mixed_flow',
    (select ids from msg_ids),
    '11111111-1111-1111-1111-111111111111'::uuid
  )
)
select is(
  (select count(*)::int from started_tasks where flow_input is not null),
  2,
  'Both root non-map steps should receive non-null flow_input'
);

select finish();
rollback;
