begin;
select plan(4);
select pgflow_tests.reset_db();

select pgflow.create_flow('simple');
select pgflow.add_step('simple', 'task');
select pgflow.start_flow('simple', '"hello"'::jsonb);

-- SETUP: Create workers
select pgflow_tests.ensure_worker('simple', '00000000-0000-0000-0000-000000000001'::uuid);
select pgflow_tests.ensure_worker('simple', '00000000-0000-0000-0000-000000000002'::uuid);

-- SETUP: Get message IDs and start tasks with specific worker
with msg_ids as (
  select array_agg(msg_id) as ids
  from pgflow.read_with_poll('simple', 10, 5, 1, 100)
)
select pgflow.start_tasks(
  (select ids from msg_ids), 
  '00000000-0000-0000-0000-000000000001'::uuid
);

-- TEST: Task should be assigned to the worker
select is(
  (select last_worker_id::text from pgflow.step_tasks where step_slug = 'task'),
  '00000000-0000-0000-0000-000000000001',
  'Task should be assigned to the specified worker'
);

-- SETUP: Start another task with different worker
select pgflow.start_flow('simple', '"world"'::jsonb);
with msg_ids as (
  select array_agg(msg_id) as ids
  from pgflow.read_with_poll('simple', 10, 5, 1, 100)
)
select pgflow.start_tasks(
  (select ids from msg_ids), 
  '00000000-0000-0000-0000-000000000002'::uuid
);

-- TEST: Second task should be assigned to different worker
select is(
  (select last_worker_id::text from pgflow.step_tasks where step_slug = 'task' and last_worker_id::text = '00000000-0000-0000-0000-000000000002'),
  '00000000-0000-0000-0000-000000000002',
  'Second task should be assigned to different worker'
);

-- TEST: start_tasks with empty message array returns no tasks
select is(
  (select count(*)::int from pgflow.start_tasks(
    array[]::bigint[], 
    '00000000-0000-0000-0000-000000000001'::uuid
  )),
  0,
  'start_tasks with empty array should return no tasks'
);

-- TEST: Worker assignments are correctly tracked
select is(
  (select count(distinct last_worker_id)::int from pgflow.step_tasks where last_worker_id is not null),
  2,
  'Should have tasks assigned to 2 different workers'
);

select finish();
rollback;