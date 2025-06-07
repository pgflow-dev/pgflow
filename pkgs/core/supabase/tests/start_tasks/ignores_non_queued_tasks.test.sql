begin;

select plan(7);
select pgflow_tests.reset_db();

-- Test that start_tasks only processes queued tasks and leaves other statuses untouched

-- Setup separate flows for clear isolation
select pgflow.create_flow('queued_flow');
select pgflow.add_step('queued_flow', 'queued_step');

select pgflow.create_flow('started_flow');  
select pgflow.add_step('started_flow', 'started_step');

select pgflow.create_flow('completed_flow');
select pgflow.add_step('completed_flow', 'completed_step');

-- Start flows to create three separate queued tasks
select pgflow.start_flow('queued_flow', '{"input": "queued"}'::jsonb);
select pgflow.start_flow('started_flow', '{"input": "started"}'::jsonb);
select pgflow.start_flow('completed_flow', '{"input": "completed"}'::jsonb);

-- Progress two tasks to different statuses: started and completed
-- Get started_flow task to 'started' status (leave it there)
select pgflow_tests.read_and_start('started_flow', 10, 1);

-- Get completed_flow task to 'completed' status  
select pgflow_tests.poll_and_complete('completed_flow', 10, 1);

-- Verify we have the expected statuses
select is(
  (select count(*) from pgflow.step_tasks where status = 'queued'),
  1::bigint,
  'Should have 1 queued task remaining'
);

select is(
  (select count(*) from pgflow.step_tasks where status = 'started'),
  1::bigint,
  'Should have 1 started task'
);

select is(
  (select count(*) from pgflow.step_tasks where status = 'completed'),
  1::bigint,
  'Should have 1 completed task'
);

-- Capture initial state of non-queued tasks for comparison
create temp table initial_state as
select run_id, step_slug, status, started_at, completed_at, attempts_count, last_worker_id, output
from pgflow.step_tasks 
where status in ('started', 'completed');

-- Get all message IDs from all tasks
create temp table all_msg_ids as
select array_agg(message_id) as msg_ids
from pgflow.step_tasks;

-- Ensure worker exists
select pgflow_tests.ensure_worker('test_flow');

-- Test: start_tasks should only process the queued task, ignoring started/completed
select is(
  (select count(*) from pgflow.start_tasks(
    (select msg_ids from all_msg_ids),
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  1::bigint,
  'start_tasks should only process 1 queued task, ignoring started/completed tasks'
);

-- Test: The queued task should now be started
select is(
  (select count(*) from pgflow.step_tasks where status = 'started'),
  2::bigint,
  'Should now have 2 started tasks (original + newly started)'
);

-- Test: Completed task should remain unchanged
select is(
  (select count(*) from pgflow.step_tasks where status = 'completed'),
  1::bigint,
  'Should still have 1 completed task (unchanged)'
);

-- Test: Non-queued tasks should have all fields unchanged
select is(
  (select count(*) from pgflow.step_tasks s
   join initial_state i on s.run_id = i.run_id and s.step_slug = i.step_slug
   where s.status in ('started', 'completed')
     and s.started_at = i.started_at
     and s.completed_at is not distinct from i.completed_at
     and s.attempts_count = i.attempts_count
     and s.last_worker_id = i.last_worker_id
     and s.output is not distinct from i.output),
  2::bigint,
  'Non-queued tasks should have all fields unchanged'
);

select * from finish();
rollback;