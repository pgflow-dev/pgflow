begin;
select plan(5);
select pgflow_tests.reset_db();

select pgflow.create_flow('multi_flow');
select pgflow.add_step('multi_flow', 'task1');
select pgflow.add_step('multi_flow', 'task2');

-- SETUP: Start multiple flows
select pgflow.start_flow('multi_flow', '"first"'::jsonb);
select pgflow.start_flow('multi_flow', '"second"'::jsonb);

-- Ensure worker exists
select pgflow_tests.ensure_worker('multi_flow');

-- Read and start multiple tasks
with msgs as (
  select * from pgmq.read_with_poll('multi_flow', 10, 10, 1, 50) limit 10
),
msg_ids as (
  select array_agg(msg_id) as ids from msgs
)
-- TEST: start_tasks should return multiple tasks
select is(
  (select count(*)::int from pgflow.start_tasks(
    'multi_flow',
    (select ids from msg_ids),
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  4,
  'start_tasks should return multiple tasks when multiple messages available'
);

-- TEST: All tasks should be started
select is(
  (select count(*)::int from pgflow.step_tasks where status = 'started'),
  4,
  'All tasks should be in started status'
);

-- TEST: All tasks should have started_at timestamp
select is(
  (select count(*)::int from pgflow.step_tasks where started_at is not null),
  4,
  'All tasks should have started_at timestamp'
);

-- TEST: All tasks should have same worker ID
select is(
  (select count(distinct last_worker_id)::int from pgflow.step_tasks where status = 'started'),
  1,
  'All tasks should have same worker ID'
);

-- TEST: All single tasks should have task_index = 0
select ok(
  (select bool_and(task_index = 0) from pgflow.step_tasks
   where flow_slug = 'multi_flow'),
  'All single tasks should have task_index = 0'
);

select finish();
rollback;