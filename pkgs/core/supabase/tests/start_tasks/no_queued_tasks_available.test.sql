begin;
select plan(2);
select pgflow_tests.reset_db();

select pgflow.create_flow('simple');
select pgflow.add_step('simple', 'task');
select pgflow.start_flow('simple', '"hello"'::jsonb);

-- Ensure worker exists
select pgflow_tests.ensure_worker('simple');

-- SETUP: Start the task first time
with msg_ids as (
  select array_agg(msg_id) as ids
  from pgflow.read_with_poll('simple', 10, 5, 1, 100)
)
select pgflow.start_tasks(
  (select ids from msg_ids),
  '11111111-1111-1111-1111-111111111111'::uuid
);

-- TEST: start_tasks should return no tasks when task is already started
-- Using the same message IDs again (task is now 'started', not 'queued')
with original_msg_ids as (
  select array_agg(message_id) as ids
  from pgflow.step_tasks
  where step_slug = 'task'
)
select is(
  (select count(*)::int from pgflow.start_tasks(
    (select ids from original_msg_ids),
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  0,
  'start_tasks should return no tasks when task is already started'
);

-- TEST: Task should still be 'started' status
select is(
  (select status from pgflow.step_tasks where step_slug = 'task'),
  'started',
  'Task should remain in started status'
);

select finish();
rollback;