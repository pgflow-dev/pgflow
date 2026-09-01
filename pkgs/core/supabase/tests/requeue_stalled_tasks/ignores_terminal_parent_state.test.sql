-- Test: requeue_stalled_tasks only recovers tasks on started runs under started steps
-- A stale started task on a failed run or under a terminal step is ignored.
begin;
select plan(10);

select pgflow_tests.reset_db();

-- ==========================================
-- Scenario 1: terminal step, started run (skipped step leaves stale rows ignored)
-- ==========================================
select pgflow.create_flow('skip_stall_test', null, null, 5);
select pgflow.add_step(
  flow_slug => 'skip_stall_test',
  step_slug => 'map_a',
  step_type => 'map',
  max_attempts => 0,
  when_exhausted => 'skip'
);
select pgflow.add_step('skip_stall_test', 'root_b');

-- 2-element array: map_a gets tasks 0 and 1; root_b gets 1 task
select run_id as skip_run_id from pgflow.start_flow('skip_stall_test', '["x", "y"]'::jsonb) \gset

select pgflow_tests.ensure_worker('skip_stall_test');

-- Start map_a task 0 and root_b task
select * from pgflow_tests.read_and_start('skip_stall_test', 30, 10);

-- Fail map_a task 0 with when_exhausted='skip': step skipped, run continues
select pgflow.fail_task(:'skip_run_id'::uuid, 'map_a', 0, 'skip me');

select is(
  (select status from pgflow.step_states
   where run_id = :'skip_run_id'::uuid and step_slug = 'map_a'),
  'skipped',
  'map_a step should be skipped (terminal) while run stays started'
);

select is(
  (select status from pgflow.runs where run_id = :'skip_run_id'::uuid),
  'started',
  'Run should stay started after skip'
);

-- Backdate root_b (started run + started step): genuine recovery target
update pgflow.step_tasks
set queued_at = now() - interval '40 seconds',
    started_at = now() - interval '36 seconds'
where run_id = :'skip_run_id'::uuid and step_slug = 'root_b';

-- Simulate a legacy stale row: map_a task 1 was terminalized as skipped,
-- rewrite it to started to reproduce pre-#645 data under a terminal step
update pgflow.step_tasks
set status = 'started',
    queued_at = now() - interval '40 seconds',
    started_at = now() - interval '36 seconds'
where run_id = :'skip_run_id'::uuid and step_slug = 'map_a' and task_index = 1;

select is(
  pgflow.requeue_stalled_tasks(),
  1,
  'Only the started task under a started step should be requeued'
);

select is(
  (select status from pgflow.step_tasks
   where run_id = :'skip_run_id'::uuid and step_slug = 'root_b'),
  'queued',
  'Genuine stalled task on started run and step should be requeued'
);

select is(
  (select status from pgflow.step_tasks
   where run_id = :'skip_run_id'::uuid and step_slug = 'map_a' and task_index = 1),
  'started',
  'Stale started task under a terminal step should be ignored'
);

-- ==========================================
-- Scenario 2: failed run (stale started rows ignored)
-- ==========================================
select pgflow.create_flow('failed_stall_test', max_attempts => 1, timeout => 5);
select pgflow.add_step('failed_stall_test', 'step_a');
select pgflow.add_step('failed_stall_test', 'step_b');

select run_id as fail_run_id from pgflow.start_flow('failed_stall_test', '{}') \gset

select pgflow_tests.ensure_worker('failed_stall_test');
select * from pgflow_tests.read_and_start('failed_stall_test', 30, 10);

-- Fail step_a: run fails and step_b task is terminalized as cancelled
select pgflow.fail_task(:'fail_run_id'::uuid, 'step_a', 0, 'boom');

select is(
  (select status from pgflow.step_tasks
   where run_id = :'fail_run_id'::uuid and step_slug = 'step_b'),
  'cancelled',
  'step_b task should be cancelled when the run fails'
);

-- Simulate a legacy stale row: rewrite the cancelled row to started
update pgflow.step_tasks
set status = 'started',
    queued_at = now() - interval '40 seconds',
    started_at = now() - interval '36 seconds'
where run_id = :'fail_run_id'::uuid and step_slug = 'step_b';

select is(
  pgflow.requeue_stalled_tasks(),
  0,
  'Stale started task on a failed run should be ignored'
);

select is(
  (select status from pgflow.step_tasks
   where run_id = :'fail_run_id'::uuid and step_slug = 'step_b'),
  'started',
  'Failed-run stale task should stay untouched (migration owns its repair)'
);

-- The failed run's task must not gain requeue history
select is(
  (select requeued_count from pgflow.step_tasks
   where run_id = :'fail_run_id'::uuid and step_slug = 'step_b'),
  0,
  'Failed-run stale task should not gain requeue history'
);

select is(
  (select count(*)::int from pgmq.q_failed_stall_test),
  0,
  'Failed-run stale task should not get a new visible queue message'
);

select finish();
rollback;
