-- Test: Basic requeue functionality for stalled tasks
begin;
select plan(12);

select pgflow_tests.reset_db();

-- Create a flow with timeout of 5 seconds
select pgflow.create_flow('test_flow', null, null, 5);
select pgflow.add_step('test_flow', 'step_a');

-- Start a flow run
select pgflow.start_flow('test_flow', '{"input": "test"}'::jsonb);

-- Ensure worker and read+start a task
select pgflow_tests.ensure_worker('test_flow');
select pgflow_tests.read_and_start('test_flow', 30, 1);

-- Test 1: Task is initially in 'started' status
select is(
  (select status from pgflow.step_tasks where step_slug = 'step_a' limit 1),
  'started',
  'Task should be in started status initially'
);

-- Test 2: requeue_stalled_tasks returns 0 when no tasks are stalled (within timeout)
select is(
  pgflow.requeue_stalled_tasks(),
  0,
  'Should return 0 when no tasks are stalled yet'
);

-- Test 3: Task still started (not stalled yet - within timeout + 30s buffer)
select is(
  (select status from pgflow.step_tasks where step_slug = 'step_a' limit 1),
  'started',
  'Task should remain started when within timeout window'
);

-- Simulate a stalled task by backdating timestamps to timeout + 31 seconds ago
-- Must also backdate queued_at to satisfy started_at >= queued_at constraint
update pgflow.step_tasks
set 
  queued_at = now() - interval '40 seconds',
  started_at = now() - interval '36 seconds'
where step_slug = 'step_a';

-- Test 4: requeue_stalled_tasks returns 1 when task is stalled
select is(
  pgflow.requeue_stalled_tasks(),
  1,
  'Should return 1 when one task is stalled'
);

-- Test 5: Task is now back to 'queued' status
select is(
  (select status from pgflow.step_tasks where step_slug = 'step_a' limit 1),
  'queued',
  'Stalled task should be requeued to queued status'
);

-- Test 6: requeued_count is incremented
select is(
  (select requeued_count from pgflow.step_tasks where step_slug = 'step_a' limit 1),
  1,
  'requeued_count should be 1 after first requeue'
);

-- Test 7: last_requeued_at is set
select ok(
  (select last_requeued_at is not null from pgflow.step_tasks where step_slug = 'step_a' limit 1),
  'last_requeued_at should be set after requeue'
);

-- Test 8: started_at is cleared
select is(
  (select started_at from pgflow.step_tasks where step_slug = 'step_a' limit 1),
  null,
  'started_at should be cleared after requeue'
);

-- Test 9: attempts_count is NOT reset (task will retry)
select is(
  (select attempts_count from pgflow.step_tasks where step_slug = 'step_a' limit 1),
  1,
  'attempts_count should remain unchanged after requeue'
);

-- Test 10: Calling again returns 0 (task no longer stalled)
select is(
  pgflow.requeue_stalled_tasks(),
  0,
  'Should return 0 when called again with no stalled tasks'
);

-- Test 11: Message is visible in queue again (can be read)
select ok(
  (select count(*) > 0 from pgmq.read('test_flow', 0, 1)),
  'Message should be readable from the queue after requeue'
);

-- Test 12: last_worker_id is cleared
select is(
  (select last_worker_id from pgflow.step_tasks where step_slug = 'step_a' limit 1),
  null,
  'last_worker_id should be cleared after requeue'
);

select finish();
rollback;
