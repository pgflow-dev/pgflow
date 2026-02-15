-- Test: when_exhausted='skip' should archive all queued/started sibling task messages
-- Verifies that when a map step transitions to skipped, sibling messages are archived
begin;
select plan(6);
select pgflow_tests.reset_db();

-- Setup: Create flow with single root map step (max_attempts=0, when_exhausted='skip')
select pgflow.create_flow('skip_archive_test');
select pgflow.add_step(
  flow_slug => 'skip_archive_test',
  step_slug => 'map_a',
  step_type => 'map',
  max_attempts => 0,
  when_exhausted => 'skip'
);

-- Start flow with 3 array elements (creates 3 tasks)
select run_id as test_run_id from pgflow.start_flow('skip_archive_test', '[1, 2, 3]'::jsonb) \gset

-- Verify all 3 messages are in queue
select is(
  (select count(*) from pgmq.q_skip_archive_test),
  3::bigint,
  'Should have 3 messages in queue initially'
);

-- Ensure worker exists (returns worker_id uuid)
select pgflow_tests.ensure_worker('skip_archive_test') as test_worker_id \gset

-- Start task 0 and task 1 (leave task 2 queued)
-- Get message_id for task 0
select message_id as msg_0 from pgflow.step_tasks
where run_id = :'test_run_id'::uuid and step_slug = 'map_a' and task_index = 0 \gset

select pgflow.start_tasks('skip_archive_test', array[:'msg_0'::bigint], :'test_worker_id'::uuid);

-- Get message_id for task 1
select message_id as msg_1 from pgflow.step_tasks
where run_id = :'test_run_id'::uuid and step_slug = 'map_a' and task_index = 1 \gset

select pgflow.start_tasks('skip_archive_test', array[:'msg_1'::bigint], :'test_worker_id'::uuid);

-- Verify: 2 started, 1 queued
select is(
  (select count(*)::int from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid and step_slug = 'map_a' and status = 'started'),
  2,
  'Should have 2 started tasks'
);

select is(
  (select count(*)::int from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid and step_slug = 'map_a' and status = 'queued'),
  1,
  'Should have 1 queued task'
);

-- Fail task 0 (max_attempts=0 means immediate exhaustion -> step becomes skipped)
select pgflow.fail_task(
  :'test_run_id'::uuid,
  'map_a',
  0,
  'Task 0 failed!'
);

-- CRITICAL TEST: Queue should have 0 messages (all archived when step skipped)
select is(
  (select count(*) from pgmq.q_skip_archive_test),
  0::bigint,
  'Queue should be empty - sibling messages archived when step skipped'
);

-- Test: Verify messages were archived (1 from failed task, 2 from siblings)
select is(
  (select count(*) from pgmq.a_skip_archive_test),
  3::bigint,
  'All 3 messages should be in archive (failed task + 2 siblings)'
);

-- Test: Step should be skipped (not failed)
select is(
  (select status from pgflow.step_states
   where run_id = :'test_run_id'::uuid and step_slug = 'map_a'),
  'skipped',
  'Step should be skipped when when_exhausted=skip'
);

select * from finish();
rollback;
