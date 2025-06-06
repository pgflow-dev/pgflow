begin;
select plan(4);
select pgflow_tests.reset_db();

select pgflow.create_flow('simple');
select pgflow.add_step('simple', 'task');
select pgflow.start_flow('simple', '"hello"'::jsonb);

-- SETUP: Create a worker
insert into pgflow.workers (worker_id, queue_name, function_name)
values ('00000000-0000-0000-0000-000000000001'::uuid, 'simple', 'test_function');

-- SETUP: Get message IDs and start tasks with specific worker
select array_agg(msg_id) into @msg_ids 
from pgflow.read_with_poll('simple', 10, 5, 1, 100);

perform pgflow.start_tasks(@msg_ids, '00000000-0000-0000-0000-000000000001'::uuid) from (select 1) t;

-- TEST: Task should be assigned to the worker
select is(
  (select last_worker_id::text from pgflow.step_tasks where step_slug = 'task'),
  '00000000-0000-0000-0000-000000000001',
  'Task should be assigned to the specified worker'
);

-- SETUP: Start another task with different worker
select pgflow.start_flow('simple', '"world"'::jsonb);
select array_agg(msg_id) into @msg_ids2 
from pgflow.read_with_poll('simple', 10, 5, 1, 100);

perform pgflow.start_tasks(@msg_ids2, '00000000-0000-0000-0000-000000000002'::uuid) from (select 1) t;

-- TEST: Second task should be assigned to different worker
select is(
  (select last_worker_id::text from pgflow.step_tasks where step_slug = 'task' and last_worker_id::text = '00000000-0000-0000-0000-000000000002'),
  '00000000-0000-0000-0000-000000000002',
  'Second task should be assigned to different worker'
);

-- TEST: start_tasks with nonexistent worker should still work (foreign key allows it)
select pgflow.start_flow('simple', '"test"'::jsonb);
select array_agg(msg_id) into @msg_ids3 
from pgflow.read_with_poll('simple', 10, 5, 1, 100);

select is(
  (select count(*)::int from pgflow.start_tasks(@msg_ids3, '99999999-9999-9999-9999-999999999999'::uuid)),
  1,
  'start_tasks should work with nonexistent worker ID'
);

-- TEST: Task should be assigned to nonexistent worker
select is(
  (select last_worker_id::text from pgflow.step_tasks where step_slug = 'task' and last_worker_id::text = '99999999-9999-9999-9999-999999999999'),
  '99999999-9999-9999-9999-999999999999',
  'Task should be assigned to nonexistent worker ID'
);

select finish();
rollback;