begin;
select plan(4);
select pgflow_tests.reset_db();

select pgflow.create_flow('multi_flow');
select pgflow.add_step('multi_flow', 'task1');
select pgflow.add_step('multi_flow', 'task2');

-- SETUP: Start multiple flows
select pgflow.start_flow('multi_flow', '"first"'::jsonb);
select pgflow.start_flow('multi_flow', '"second"'::jsonb);

-- SETUP: Get all message IDs
select array_agg(msg_id) into @msg_ids 
from pgflow.read_with_poll('multi_flow', 10, 10, 1, 100);

-- TEST: start_tasks should return multiple tasks
select is(
  (select count(*)::int from pgflow.start_tasks(@msg_ids, gen_random_uuid())),
  2,
  'start_tasks should return multiple tasks when multiple messages provided'
);

-- TEST: All tasks should be started
select is(
  (select count(*)::int from pgflow.step_tasks where status = 'started'),
  2,
  'All tasks should be in started status'
);

-- TEST: All tasks should have started_at timestamp
select is(
  (select count(*)::int from pgflow.step_tasks where started_at is not null),
  2,
  'All tasks should have started_at timestamp'
);

-- TEST: All tasks should have same worker ID
select is(
  (select count(distinct last_worker_id)::int from pgflow.step_tasks where status = 'started'),
  1,
  'All tasks should have same worker ID'
);

select finish();
rollback;