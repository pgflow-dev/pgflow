begin;
select plan(6);
select pgflow_tests.reset_db();

select pgflow.create_flow('simple');
select pgflow.add_step('simple', 'task');
select pgflow.start_flow('simple', '"hello"'::jsonb);

-- Create a worker
insert into pgflow.workers (worker_id, queue_name, function_name, last_heartbeat_at)
values ('11111111-1111-1111-1111-111111111111'::uuid, 'simple', 'test_worker', now());

-- TEST: start_tasks returns tasks for valid message IDs
with msg_ids as (
  select array_agg(msg_id) as ids
  from pgflow.read_with_poll('simple', 10, 5, 1, 100)
)
select is(
  (select count(*)::int from pgflow.start_tasks(
    (select ids from msg_ids), 
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  1,
  'start_tasks should return one task for valid message ID'
);

-- TEST: Task status should be 'started' after start_tasks
select is(
  (select status from pgflow.step_tasks where step_slug = 'task'),
  'started',
  'Task status should be started after start_tasks'
);

-- TEST: Task should have started_at timestamp
select ok(
  (select started_at is not null from pgflow.step_tasks where step_slug = 'task'),
  'Task should have started_at timestamp'
);

-- TEST: Task should have attempts_count incremented
select is(
  (select attempts_count::int from pgflow.step_tasks where step_slug = 'task'),
  1,
  'Task attempts_count should be incremented'
);

-- TEST: Task should have last_worker_id set
select ok(
  (select last_worker_id is not null from pgflow.step_tasks where step_slug = 'task'),
  'Task should have last_worker_id set'
);

-- TEST: Empty array returns no tasks
select is(
  (select count(*)::int from pgflow.start_tasks(array[]::bigint[], '11111111-1111-1111-1111-111111111111'::uuid)),
  0,
  'start_tasks with empty array should return no tasks'
);

select finish();
rollback;