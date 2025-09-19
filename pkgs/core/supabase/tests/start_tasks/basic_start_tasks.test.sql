begin;
select plan(7);
select pgflow_tests.reset_db();

select pgflow.create_flow('simple');
select pgflow.add_step('simple', 'task');
select pgflow.start_flow('simple', '"hello"'::jsonb);

-- Ensure worker exists
select pgflow_tests.ensure_worker('simple');

-- Read messages from queue and start task
with msgs as (
  select * from pgflow.read_with_poll('simple', 10, 5, 1, 50) limit 1
),
msg_ids as (
  select array_agg(msg_id) as ids from msgs
),
started_tasks as (
  select * from pgflow.start_tasks(
    'simple',
    (select ids from msg_ids),
    '11111111-1111-1111-1111-111111111111'::uuid
  )
)
-- TEST: start_tasks returns tasks for valid message IDs
select is(
  (select count(*)::int from started_tasks),
  1,
  'start_tasks should return one task for valid message ID'
);

-- TEST: Task has task_index = 0 (checking from step_tasks table since already started)
select is(
  (select task_index from pgflow.step_tasks where step_slug = 'task'),
  0,
  'Single task should have task_index = 0'
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

-- TEST: Empty queue returns no tasks (after task is already started)
with msgs as (
  select * from pgflow.read_with_poll('simple', 10, 5, 1, 50) limit 5
),
msg_ids as (
  select array_agg(msg_id) as ids from msgs
)
select is(
  (select count(*)::int from pgflow.start_tasks(
    'simple',
    (select ids from msg_ids),
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  0,
  'start_tasks should return no tasks when queue is empty'
);

select finish();
rollback;