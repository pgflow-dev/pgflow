-- Test: Max requeue limit (3 requeues then archive)
begin;
select plan(10);

select pgflow_tests.reset_db();

-- Create a flow with timeout of 5 seconds
select pgflow.create_flow('test_flow', null, null, 5);
select pgflow.add_step('test_flow', 'step_a');

-- Start a flow run
select pgflow.start_flow('test_flow', '{"input": "test"}'::jsonb);

-- Ensure worker and read+start a task
select pgflow_tests.ensure_worker('test_flow');
select pgflow_tests.read_and_start('test_flow', 30, 1);

-- Test 1-3: Requeue 3 times successfully
-- First requeue
update pgflow.step_tasks
set 
  queued_at = now() - interval '40 seconds',
  started_at = now() - interval '36 seconds'
where step_slug = 'step_a';

select is(
  pgflow.requeue_stalled_tasks(),
  1,
  'First requeue should succeed'
);

-- Start again and make it stalled for second requeue
select pgflow_tests.read_and_start('test_flow', 30, 1);
update pgflow.step_tasks
set 
  queued_at = now() - interval '40 seconds',
  started_at = now() - interval '36 seconds'
where step_slug = 'step_a';

select is(
  pgflow.requeue_stalled_tasks(),
  1,
  'Second requeue should succeed'
);

-- Start again and make it stalled for third requeue
select pgflow_tests.read_and_start('test_flow', 30, 1);
update pgflow.step_tasks
set 
  queued_at = now() - interval '40 seconds',
  started_at = now() - interval '36 seconds'
where step_slug = 'step_a';

select is(
  pgflow.requeue_stalled_tasks(),
  1,
  'Third requeue should succeed'
);

-- Test 4: requeued_count is now 3
select is(
  (select requeued_count from pgflow.step_tasks where step_slug = 'step_a' limit 1),
  3,
  'requeued_count should be 3 after three requeues'
);

-- Start again and make it stalled for fourth attempt
select pgflow_tests.read_and_start('test_flow', 30, 1);
update pgflow.step_tasks
set 
  queued_at = now() - interval '40 seconds',
  started_at = now() - interval '36 seconds'
where step_slug = 'step_a';

-- Test 5: Fourth requeue attempt should archive instead (returns 0 requeued)
select is(
  pgflow.requeue_stalled_tasks(),
  0,
  'Fourth requeue attempt should return 0 (task archived, not requeued)'
);

-- Test 6: Task should still be in 'started' status (not failed)
select is(
  (select status from pgflow.step_tasks where step_slug = 'step_a' limit 1),
  'started',
  'Task should remain started after max requeues (easy to identify via requeued_count)'
);

-- Test 7: requeued_count should still be 3 (not incremented on archive)
select is(
  (select requeued_count from pgflow.step_tasks where step_slug = 'step_a' limit 1),
  3,
  'requeued_count should remain 3 after archive'
);

-- Test 8: Message should be archived from queue (not readable)
select is(
  (select count(*)::int from pgmq.read('test_flow', 0, 10)),
  0,
  'Message should be archived from the queue'
);

-- Test 9: permanently_stalled_at should be set
select ok(
  (select permanently_stalled_at from pgflow.step_tasks where step_slug = 'step_a' limit 1) is not null,
  'permanently_stalled_at should be set after max requeues'
);

-- Test 10: Calling requeue again should NOT reprocess the stalled task (bug fix verification)
select is(
  pgflow.requeue_stalled_tasks(),
  0,
  'Subsequent requeue call should return 0 (permanently stalled task filtered out)'
);

select finish();
rollback;
