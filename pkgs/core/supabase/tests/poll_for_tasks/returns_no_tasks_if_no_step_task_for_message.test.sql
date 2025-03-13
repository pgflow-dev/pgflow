begin;
select * from plan(1);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run which will put a task in the queue
with flow_run as (
  select * from pgflow.start_flow('sequential', '{"id": 1}'::jsonb)
)

-- Manually delete a step_task but keep the message in the queue
-- This simulates an inconsistent state where a message exists
-- but there's no corresponding step_task
delete from pgflow.step_tasks
where
  run_id = (
    select run_id from pgflow.runs
    where flow_slug = 'sequential' limit 1
  )
  and step_slug = 'first';

-- TEST: Polling should not return tasks for missing step_tasks
-- even though messages might exist in the queue
select is(
  (select count(*)::integer from pgflow.poll_for_tasks(
    queue_name => 'sequential'::text,
    vt => 5,
    qty => 1,
    max_poll_seconds => 1
  )),
  0::integer,
  'Should not return tasks when step_tasks row is missing'
);

select * from finish();
rollback;
