begin;

select plan(7);
select pgflow_tests.reset_db();

-- Test that start_tasks only processes queued tasks and leaves other statuses untouched

-- Create 4 separate flows, each representing a different task status
select pgflow.create_flow('queued_flow');
select pgflow.add_step('queued_flow', 'task');

select pgflow.create_flow('started_flow');
select pgflow.add_step('started_flow', 'task');

select pgflow.create_flow('completed_flow');
select pgflow.add_step('completed_flow', 'task');

select pgflow.create_flow('failed_flow', max_attempts => 1);
select pgflow.add_step('failed_flow', 'task');

-- Start each flow to create one task per flow
select pgflow.start_flow('queued_flow', '{"test": "queued"}'::jsonb);
select pgflow.start_flow('started_flow', '{"test": "started"}'::jsonb);
select pgflow.start_flow('completed_flow', '{"test": "completed"}'::jsonb);
select pgflow.start_flow('failed_flow', '{"test": "failed"}'::jsonb);

-- Progress tasks to their intended statuses

-- queued_flow: Leave in 'queued' status (do nothing)

-- started_flow: Move to 'started' status
select pgflow_tests.read_and_start('started_flow', 10, 1);

-- completed_flow: Move to 'completed' status
with started_task as (
  select * from pgflow_tests.read_and_start('completed_flow', 10, 1) limit 1
)
select pgflow.complete_task(
  (select run_id from started_task),
  (select step_slug from started_task),
  0,
  '{"result": "success"}'::jsonb
) from started_task;

-- failed_flow: Move to 'failed' status
with started_task as (
  select * from pgflow_tests.read_and_start('failed_flow', 10, 1) limit 1
)
select pgflow.fail_task(
  started_task.run_id,
  started_task.step_slug,
  0,
  'Test failure'
) from started_task;

-- Verify we have the expected statuses
select is(
  (select status from pgflow.step_tasks where flow_slug = 'queued_flow'),
  'queued',
  'queued_flow task should be queued'
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'started_flow'),
  'started',
  'started_flow task should be started'
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'completed_flow'),
  'completed',
  'completed_flow task should be completed'
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'failed_flow'),
  'failed',
  'failed_flow task should be failed'
);

-- Now test that start_tasks on a specific flow only affects queued tasks in that flow

-- Capture initial state of non-queued task in started_flow
create temp table initial_state as
select run_id, step_slug, status, started_at, attempts_count, last_worker_id
from pgflow.step_tasks 
where flow_slug = 'started_flow';

-- Get message IDs from started_flow (which has a started task)
create temp table started_flow_msg_ids as
select array_agg(message_id) as msg_ids
from pgflow.step_tasks
where flow_slug = 'started_flow';

-- Ensure worker exists for started_flow
select pgflow_tests.ensure_worker('started_flow');

-- Test: start_tasks on started_flow should return 0 tasks (no queued tasks)
select is(
  (select count(*) from pgflow.start_tasks(
    'started_flow',
    (select msg_ids from started_flow_msg_ids),
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  0::bigint,
  'start_tasks should return 0 tasks when no queued tasks exist'
);

-- Test: The started task should remain unchanged
select is(
  (select count(*) from pgflow.step_tasks s
   join initial_state i on s.run_id = i.run_id and s.step_slug = i.step_slug
   where s.status = i.status
     and s.started_at = i.started_at
     and s.attempts_count = i.attempts_count
     and s.last_worker_id = i.last_worker_id),
  1::bigint,
  'Started task should remain completely unchanged'
);

-- Test: Calling start_tasks on queued_flow should work normally
select is(
  (select count(*) from pgflow.start_tasks(
    'queued_flow',
    (select array_agg(message_id) from pgflow.step_tasks where flow_slug = 'queued_flow'),
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  1::bigint,
  'start_tasks should process the queued task in queued_flow'
);

select * from finish();
rollback;