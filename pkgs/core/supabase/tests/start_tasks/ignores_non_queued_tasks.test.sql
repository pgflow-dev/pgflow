begin;

select plan(8);
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

-- Test that read_and_start properly ignores non-queued tasks
-- Each test clearly shows which task status is being tested

-- Test 1: started_flow should return 0 tasks (task status: started)
select is(
  (select count(*) from pgflow_tests.read_and_start('started_flow', 1, 10)),
  0::bigint,
  'read_and_start on started_flow should return 0 tasks (task status: started)'
);

-- Test 2: completed_flow should return 0 tasks (task status: completed) 
select is(
  (select count(*) from pgflow_tests.read_and_start('completed_flow', 1, 10)),
  0::bigint,
  'read_and_start on completed_flow should return 0 tasks (task status: completed)'
);

-- Test 3: failed_flow should return 0 tasks (task status: failed)
select is(
  (select count(*) from pgflow_tests.read_and_start('failed_flow', 1, 10)),
  0::bigint,
  'read_and_start on failed_flow should return 0 tasks (task status: failed)'
);

-- Test 4: queued_flow should return 1 task (task status: queued)
select is(
  (select count(*) from pgflow_tests.read_and_start('queued_flow', 30, 10)),
  1::bigint,
  'read_and_start on queued_flow should return 1 task (task status: queued)'
);

select * from finish();
rollback;