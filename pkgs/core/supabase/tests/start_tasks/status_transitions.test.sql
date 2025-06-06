begin;
select plan(8);
select pgflow_tests.reset_db();

select pgflow.create_flow('status_flow', max_attempts => 2);
select pgflow.add_step('status_flow', 'task');
select pgflow.start_flow('status_flow', '"hello"'::jsonb);

-- TEST: Initial task status should be 'queued'
select is(
  (select status from pgflow.step_tasks where step_slug = 'task'),
  'queued',
  'Initial task status should be queued'
);

-- Create a worker
insert into pgflow.workers (worker_id, queue_name, function_name, last_heartbeat_at)
values ('11111111-1111-1111-1111-111111111111'::uuid, 'status_flow', 'test_worker', now());

-- SETUP: Start the task using start_tasks
with msg_ids as (
  select array_agg(msg_id) as ids
  from pgflow.read_with_poll('status_flow', 10, 5, 1, 100)
)
select pgflow.start_tasks(
  (select ids from msg_ids), 
  '11111111-1111-1111-1111-111111111111'::uuid
);

-- TEST: Task status should be 'started' after start_tasks
select is(
  (select status from pgflow.step_tasks where step_slug = 'task'),
  'started',
  'Task status should be started after start_tasks'
);

-- SETUP: Complete the task
select pgflow.complete_task(
  run_id => (select run_id from pgflow.runs where flow_slug = 'status_flow'),
  step_slug => 'task',
  task_index => 0,
  output => '{"result": "success"}'::jsonb
);

-- TEST: Task status should be 'completed' after completion
select is(
  (select status from pgflow.step_tasks where step_slug = 'task'),
  'completed',
  'Task status should be completed after completion'
);

-- SETUP: Start a new flow for failure test
select pgflow.start_flow('status_flow', '"world"'::jsonb);
with msg_ids as (
  select array_agg(msg_id) as ids
  from pgflow.read_with_poll('status_flow', 10, 5, 1, 100)
)
select pgflow.start_tasks(
  (select ids from msg_ids), 
  '11111111-1111-1111-1111-111111111111'::uuid
);

-- TEST: Second task should be 'started'
select is(
  (select count(*)::int from pgflow.step_tasks where status = 'started'),
  1,
  'Second task should be in started status'
);

-- SETUP: Fail the task (should retry since max_attempts = 2)
select pgflow.fail_task(
  run_id => (select run_id from pgflow.runs where flow_slug = 'status_flow' order by started_at desc limit 1),
  step_slug => 'task',
  task_index => 0,
  error_message => 'test failure'
);

-- TEST: Task should be back to 'queued' after failure with retries
select is(
  (select status from pgflow.step_tasks 
   where step_slug = 'task' 
   and run_id = (select run_id from pgflow.runs where flow_slug = 'status_flow' order by started_at desc limit 1)),
  'queued',
  'Task should be queued after failure with retries available'
);

-- TEST: started_at should be null after reset to queued
select ok(
  (select started_at is null from pgflow.step_tasks 
   where step_slug = 'task' 
   and run_id = (select run_id from pgflow.runs where flow_slug = 'status_flow' order by started_at desc limit 1)),
  'started_at should be null after reset to queued'
);

-- SETUP: Start and fail again (should permanently fail)
with msg_ids as (
  select array_agg(msg_id) as ids
  from pgflow.read_with_poll('status_flow', 10, 5, 1, 100)
)
select pgflow.start_tasks(
  (select ids from msg_ids), 
  '11111111-1111-1111-1111-111111111111'::uuid
);

select pgflow.fail_task(
  run_id => (select run_id from pgflow.runs where flow_slug = 'status_flow' order by started_at desc limit 1),
  step_slug => 'task',
  task_index => 0,
  error_message => 'final failure'
);

-- TEST: Task should be 'failed' after exceeding max attempts
select is(
  (select status from pgflow.step_tasks 
   where step_slug = 'task' 
   and run_id = (select run_id from pgflow.runs where flow_slug = 'status_flow' order by started_at desc limit 1)),
  'failed',
  'Task should be failed after exceeding max attempts'
);

select finish();
rollback;