begin;
select plan(5);
select pgflow_tests.reset_db();

-- Test 1: Single step returns task_index 0
select pgflow.create_flow('single_task');
select pgflow.add_step('single_task', 'step1');
select pgflow.start_flow('single_task', '{"data": "test"}'::jsonb);

-- Ensure worker and read message
select pgflow_tests.ensure_worker('single_task');

with msgs as (
  select * from pgflow.read_with_poll('single_task', 10, 5, 1, 50) limit 1
),
msg_ids as (
  select array_agg(msg_id) as ids from msgs
),
started_tasks as (
  select * from pgflow.start_tasks(
    'single_task',
    (select ids from msg_ids),
    '11111111-1111-1111-1111-111111111111'::uuid
  )
)
select is(
  (select task_index from started_tasks),
  0,
  'Single step task should have task_index 0'
);

-- Test 2: Map step with array of 3 elements returns correct task_index for each
select pgflow_tests.reset_db();
select pgflow.create_flow('map_flow');
select pgflow.add_step('map_flow', 'map_step', '{}', null, null, null, null, 'map');
select pgflow.start_flow('map_flow', '[1, 2, 3]'::jsonb);

-- Ensure worker
select pgflow_tests.ensure_worker('map_flow');

-- Read all 3 messages
with msgs as (
  select * from pgflow.read_with_poll('map_flow', 10, 5, 3, 50) order by msg_id
),
msg_ids as (
  select array_agg(msg_id order by msg_id) as ids from msgs
),
started_tasks as (
  select * from pgflow.start_tasks(
    'map_flow',
    (select ids from msg_ids),
    '11111111-1111-1111-1111-111111111111'::uuid
  ) order by task_index
)
select is(
  array_agg(task_index order by task_index),
  ARRAY[0, 1, 2],
  'Map step tasks should have sequential task_index values'
) from started_tasks;

-- Test 3: Map step with 5 elements returns correct task_index values
select pgflow_tests.reset_db();
select pgflow.create_flow('map_five');
select pgflow.add_step('map_five', 'mapper', '{}', null, null, null, null, 'map');
select pgflow.start_flow('map_five', '["a", "b", "c", "d", "e"]'::jsonb);

-- Ensure worker
select pgflow_tests.ensure_worker('map_five');

-- Read all 5 messages
with msgs as (
  select * from pgflow.read_with_poll('map_five', 10, 5, 5, 50) order by msg_id
),
msg_ids as (
  select array_agg(msg_id order by msg_id) as ids from msgs
),
started_tasks as (
  select * from pgflow.start_tasks(
    'map_five',
    (select ids from msg_ids),
    '11111111-1111-1111-1111-111111111111'::uuid
  ) order by task_index
)
select is(
  array_agg(task_index order by task_index),
  ARRAY[0, 1, 2, 3, 4],
  'Map step with 5 elements should have task_index 0-4'
) from started_tasks;

-- Test 4: Dependent map step preserves task_index
select pgflow_tests.reset_db();
select pgflow.create_flow('map_chain');
select pgflow.add_step('map_chain', 'first', '{}', null, null, null, null, 'map');
select pgflow.add_step('map_chain', 'second', ARRAY['first'], null, null, null, null, 'map');
select pgflow.start_flow('map_chain', '[10, 20]'::jsonb);

-- Complete first map tasks
select pgflow_tests.ensure_worker('map_chain');
-- Complete task index 0
with poll_result as (
  select * from pgflow_tests.read_and_start('map_chain', 1, 1) limit 1
)
select pgflow.complete_task(
  run_id,
  step_slug,
  task_index,
  jsonb_build_object('value', (input::int) * 2)
) from poll_result;
-- Complete task index 1
with poll_result as (
  select * from pgflow_tests.read_and_start('map_chain', 1, 1) limit 1
)
select pgflow.complete_task(
  run_id,
  step_slug,
  task_index,
  jsonb_build_object('value', (input::int) * 2)
) from poll_result;

-- Now read and start second map tasks
select pgflow_tests.ensure_worker('map_chain', '22222222-2222-2222-2222-222222222222'::uuid);
with msgs as (
  select * from pgflow.read_with_poll('map_chain', 10, 5, 2, 50) order by msg_id
),
msg_ids as (
  select array_agg(msg_id order by msg_id) as ids from msgs
),
started_tasks as (
  select * from pgflow.start_tasks(
    'map_chain',
    (select ids from msg_ids),
    '22222222-2222-2222-2222-222222222222'::uuid
  ) order by task_index
)
select is(
  array_agg(task_index order by task_index),
  ARRAY[0, 1],
  'Dependent map step should preserve task_index from parent'
) from started_tasks;

-- Test 5: Multiple single steps in sequence all have task_index 0
select pgflow_tests.reset_db();
select pgflow.create_flow('sequential');
select pgflow.add_step('sequential', 'step_a');
select pgflow.add_step('sequential', 'step_b', ARRAY['step_a']);
select pgflow.add_step('sequential', 'step_c', ARRAY['step_b']);
select pgflow.start_flow('sequential', '{"test": true}'::jsonb);

-- Process step_a
select pgflow_tests.ensure_worker('sequential');
with poll_result as (
  select * from pgflow_tests.read_and_start('sequential', 1, 1)
)
select pgflow.complete_task(
  run_id,
  step_slug,
  task_index,
  '{"result": "a"}'::jsonb
) from poll_result;

-- Process step_b
select pgflow_tests.ensure_worker('sequential', '33333333-3333-3333-3333-333333333333'::uuid);
with msgs as (
  select * from pgflow.read_with_poll('sequential', 10, 5, 1, 50) limit 1
),
msg_ids as (
  select array_agg(msg_id) as ids from msgs
),
started_tasks as (
  select * from pgflow.start_tasks(
    'sequential',
    (select ids from msg_ids),
    '33333333-3333-3333-3333-333333333333'::uuid
  )
)
select is(
  (select task_index from started_tasks),
  0,
  'Sequential single steps should all have task_index 0'
);

select finish();
rollback;