-- Test: Requeue handles multiple flows with different timeouts
begin;
select plan(6);

select pgflow_tests.reset_db();

-- Create two flows with different timeouts
select pgflow.create_flow('fast_flow', null, null, 5);  -- 5 second timeout
select pgflow.add_step('fast_flow', 'step_a');

select pgflow.create_flow('slow_flow', null, null, 60); -- 60 second timeout
select pgflow.add_step('slow_flow', 'step_a');

-- Start runs for both flows
select pgflow.start_flow('fast_flow', '{"input": "fast"}'::jsonb);
select pgflow.start_flow('slow_flow', '{"input": "slow"}'::jsonb);

-- Ensure workers and read+start tasks for both flows
select pgflow_tests.ensure_worker('fast_flow');
select pgflow_tests.ensure_worker('slow_flow');
select pgflow_tests.read_and_start('fast_flow', 30, 1);
select pgflow_tests.read_and_start('slow_flow', 30, 1);

-- Test 1: Both tasks are in 'started' status
select is(
  (select count(*)::int from pgflow.step_tasks where status = 'started'),
  2,
  'Both tasks should be in started status'
);

-- Test 2: No stalled tasks yet
select is(
  pgflow.requeue_stalled_tasks(),
  0,
  'No tasks stalled yet'
);

-- Backdate fast_flow task to be stalled (timeout 5s + 30s buffer = 35s, so 36s is stalled)
update pgflow.step_tasks
set 
  queued_at = now() - interval '40 seconds',
  started_at = now() - interval '36 seconds'
where flow_slug = 'fast_flow';

-- Backdate slow_flow task to 36s ago (not stalled: timeout 60s + 30s = 90s)
update pgflow.step_tasks
set 
  queued_at = now() - interval '40 seconds',
  started_at = now() - interval '36 seconds'
where flow_slug = 'slow_flow';

-- Test 3: Only fast_flow task is requeued
select is(
  pgflow.requeue_stalled_tasks(),
  1,
  'Only fast_flow task should be requeued'
);

-- Test 4: fast_flow task is queued
select is(
  (select status from pgflow.step_tasks where flow_slug = 'fast_flow' limit 1),
  'queued',
  'fast_flow task should be requeued'
);

-- Test 5: slow_flow task is still started
select is(
  (select status from pgflow.step_tasks where flow_slug = 'slow_flow' limit 1),
  'started',
  'slow_flow task should still be started (not past its timeout)'
);

-- Now backdate slow_flow to exceed its timeout (60s + 30s = 90s, so 91s is stalled)
update pgflow.step_tasks
set 
  queued_at = now() - interval '95 seconds',
  started_at = now() - interval '91 seconds'
where flow_slug = 'slow_flow';

-- Test 6: slow_flow task is now requeued
select is(
  pgflow.requeue_stalled_tasks(),
  1,
  'slow_flow task should now be requeued'
);

select finish();
rollback;
