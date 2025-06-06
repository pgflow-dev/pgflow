begin;
select plan(6);
select pgflow_tests.reset_db();

select pgflow.create_flow('simple');
select pgflow.add_step('simple', 'task');
select pgflow.start_flow('simple', '"hello"'::jsonb);

-- SETUP: Get message IDs by reading from queue
select array_agg(msg_id) into @msg_ids 
from pgflow.read_with_poll('simple', 10, 5, 1, 100);

-- TEST: start_tasks returns tasks for valid message IDs
select is(
  (select count(*)::int from pgflow.start_tasks(@msg_ids, gen_random_uuid())),
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
  (select count(*)::int from pgflow.start_tasks(array[]::bigint[], gen_random_uuid())),
  0,
  'start_tasks with empty array should return no tasks'
);

select finish();
rollback;