begin;
select plan(2);
select pgflow_tests.reset_db();

select pgflow.create_flow('simple');
select pgflow.add_step('simple', 'task');
select pgflow.start_flow('simple', '"hello"'::jsonb);

-- SETUP: Start the task first time
select array_agg(msg_id) into @msg_ids 
from pgflow.read_with_poll('simple', 10, 5, 1, 100);
perform pgflow.start_tasks(@msg_ids, gen_random_uuid()) from (select 1) t;

-- SETUP: Get the same message IDs again (they should still be hidden)
-- But now the task is 'started', not 'queued'
select array_agg(msg_id) into @msg_ids_again
from pgflow.read_with_poll('simple', 10, 5, 1, 100);

-- TEST: start_tasks should return no tasks when task is already started
select is(
  (select count(*)::int from pgflow.start_tasks(@msg_ids, gen_random_uuid())),
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