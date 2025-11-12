begin;
select plan(6);
select pgflow_tests.reset_db();

select pgflow.create_flow('status_flow', max_attempts => 2);
select pgflow.add_step('status_flow', 'task', base_delay => 0);
select pgflow.start_flow('status_flow', '"hello"'::jsonb);

-- TEST: Initial task status should be 'queued'
select is(
  (select status from pgflow.step_tasks where step_slug = 'task'),
  'queued',
  'Initial task status should be queued'
);

-- Start the task using start_tasks
select pgflow_tests.ensure_worker('status_flow');
with msg_ids as (
  select array_agg(msg_id) as ids
  from pgmq.read_with_poll('status_flow', 10, 5, 1, 100)
)
select pgflow.start_tasks(
  'status_flow',
  (select ids from msg_ids), 
  '11111111-1111-1111-1111-111111111111'::uuid
);

-- TEST: Task status should be 'started' after start_tasks
select is(
  (select status from pgflow.step_tasks where step_slug = 'task'),
  'started',
  'Task status should be started after start_tasks'
);

-- Complete the task
select pgflow.complete_task(
  run_id => (select run_id from pgflow.runs limit 1),
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

-- Test failure with retry behavior
select pgflow.start_flow('status_flow', '"retry_test"'::jsonb);
select pgflow_tests.poll_and_fail('status_flow');

-- TEST: After first failure, task should be queued (retry available)
select is(
  (select status from pgflow.step_tasks 
   where run_id = (select run_id from pgflow.runs where input::text = '"retry_test"')),
  'queued',
  'Task should be queued after first failure (retry available)'
);

-- Wait a moment to ensure message is visible after retry backoff
select pg_sleep(0.1);

-- Fail again to exceed max_attempts
select pgflow_tests.poll_and_fail('status_flow');

-- TEST: After second failure, task should be failed (no more retries)
select is(
  (select status from pgflow.step_tasks 
   where run_id = (select run_id from pgflow.runs where input::text = '"retry_test"')),
  'failed',
  'Task should be failed after exceeding max attempts'
);

-- TEST: Verify attempts_count is correct
select is(
  (select attempts_count from pgflow.step_tasks 
   where run_id = (select run_id from pgflow.runs where input::text = '"retry_test"')),
  2,
  'Task should have attempts_count of 2 after failing twice'
);

select finish();
rollback;