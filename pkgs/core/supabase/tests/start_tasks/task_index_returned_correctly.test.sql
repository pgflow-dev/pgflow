begin;
select plan(3);
select pgflow_tests.reset_db();

-- Test: start_tasks returns correct task_index field for all task types
select diag('Testing that start_tasks returns task_index correctly');

-- SETUP: Create flow with map and single steps
select pgflow.create_flow('test_task_index');

-- Add a map step that will create multiple tasks
select pgflow.add_step(
  flow_slug => 'test_task_index',
  step_slug => 'map_step',
  deps_slugs => '{}',
  step_type => 'map'
);

-- Add a single step that depends on the map
select pgflow.add_step(
  flow_slug => 'test_task_index',
  step_slug => 'single_step',
  deps_slugs => array['map_step'],
  step_type => 'single'
);

-- Start flow with array input to create multiple tasks for map step
select run_id from pgflow.start_flow('test_task_index', '[10, 20, 30, 40, 50]'::jsonb) \gset

-- Verify 5 tasks were created for map step
select is(
  (select count(*) from pgflow.step_tasks
   where run_id = :'run_id' and step_slug = 'map_step'),
  5::bigint,
  'Should create 5 tasks for map step with 5 element array'
);

-- Verify task_index values are correct in step_tasks table
select is(
  (select array_agg(task_index order by task_index) from pgflow.step_tasks
   where run_id = :'run_id' and step_slug = 'map_step'),
  ARRAY[0, 1, 2, 3, 4],
  'Map step tasks should have task_index from 0 to 4'
);

-- Ensure all workers exist for various tests
select pgflow_tests.ensure_worker('test_task_index', '11111111-1111-1111-1111-111111111111'::uuid);
select pgflow_tests.ensure_worker('test_task_index', '22222222-2222-2222-2222-222222222222'::uuid);
select pgflow_tests.ensure_worker('test_task_index', '33333333-3333-3333-3333-333333333333'::uuid);
select pgflow_tests.ensure_worker('test_task_index', '44444444-4444-4444-4444-444444444444'::uuid);
select pgflow_tests.ensure_worker('test_task_index', '55555555-5555-5555-5555-555555555555'::uuid);

-- Read messages from queue and start tasks
with msgs as (
  select * from pgflow.read_with_poll('test_task_index', 10, 10, 1, 50)
),
msg_ids as (
  select array_agg(msg_id) as ids from msgs
),
started_tasks as (
  select * from pgflow.start_tasks(
    'test_task_index',
    (select ids from msg_ids),
    '11111111-1111-1111-1111-111111111111'::uuid
  )
)
-- TEST: All returned task_index values match the expected indices
select is(
  (select array_agg(task_index order by task_index) from started_tasks),
  ARRAY[0, 1, 2, 3, 4],
  'start_tasks should return correct task_index values for all map tasks'
);

select finish();
rollback;
