begin;
select plan(10);
select pgflow_tests.reset_db();

-- Test: Both queued AND started messages are archived on type violation
-- This prevents orphaned messages cycling through workers

-- Create flow with parallel branches to have multiple tasks
select pgflow.create_flow('archive_test');
select pgflow.add_step(
  flow_slug => 'archive_test',
  step_slug => 'producer',
  step_type => 'single'
);
select pgflow.add_step(
  flow_slug => 'archive_test',
  step_slug => 'branch1',
  deps_slugs => ARRAY['producer'],
  step_type => 'single'
);
select pgflow.add_step(
  flow_slug => 'archive_test',
  step_slug => 'branch2',
  deps_slugs => ARRAY['producer'],
  step_type => 'single'
);
select pgflow.add_step(
  flow_slug => 'archive_test',
  step_slug => 'branch3',
  deps_slugs => ARRAY['producer'],
  step_type => 'single'
);
-- This map step expects arrays from branch1
select pgflow.add_step(
  flow_slug => 'archive_test',
  step_slug => 'consumer_map',
  deps_slugs => ARRAY['branch1'],
  step_type => 'map'
);

-- Start flow
select run_id as test_run_id from pgflow.start_flow('archive_test', '{}') \gset

-- Start producer task
select pgflow_tests.ensure_worker('archive_test', '11111111-1111-1111-1111-111111111111'::uuid);
SELECT * FROM pgflow_tests.read_and_start('archive_test', 1, 1) LIMIT 1;

-- Complete producer to spawn branches
SELECT pgflow.complete_task(:'test_run_id'::uuid, 'producer', 0, '{"data": "test"}'::jsonb);

-- Start some branch tasks to have a mix of queued and started
select pgflow_tests.ensure_worker('archive_test', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'worker_a');
SELECT * FROM pgflow_tests.read_and_start('archive_test', 1, 1,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'worker_a') LIMIT 1;

select pgflow_tests.ensure_worker('archive_test', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'worker_b');
SELECT * FROM pgflow_tests.read_and_start('archive_test', 1, 1,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'worker_b') LIMIT 1;

-- Count messages in queue before violation
select count(*) as queue_before from pgmq.q_archive_test \gset
select count(*) as archive_before from pgmq.a_archive_test \gset

-- Check we have both queued and started tasks with messages
select is(
  (select count(*)::int > 0 from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid
     and status = 'queued' and message_id is not null),
  true,
  'Should have queued tasks with messages before violation'
);

select is(
  (select count(*)::int > 0 from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid
     and status = 'started' and message_id is not null),
  true,
  'Should have started tasks with messages before violation'
);

-- Trigger type violation by completing branch1 with non-array (consumer_map expects array)
select lives_ok(
  format($$
    SELECT pgflow.complete_task('%s'::uuid, 'branch1', 0, '{"not": "an array"}'::jsonb)
  $$, :'test_run_id'),
  'complete_task should handle type violation'
);

-- CRITICAL: All messages should be archived (both from queued AND started tasks)
select is(
  (select count(*) from pgmq.q_archive_test),
  0::bigint,
  'Queue should be empty - ALL messages archived (not just queued ones)'
);

-- Verify messages were moved to archive, not lost
select ok(
  (select count(*) from pgmq.a_archive_test) > :archive_before::bigint,
  'Messages should be in archive table'
);

-- SECOND TEST: fail_task also archives all messages
-- Reset for second test
select pgflow_tests.reset_db();

-- Create flow with max_attempts=1 to fail immediately
select pgflow.create_flow('fail_test', max_attempts => 1);
select pgflow.add_step(
  flow_slug => 'fail_test',
  step_slug => 'task1',
  step_type => 'single'
);
select pgflow.add_step(
  flow_slug => 'fail_test',
  step_slug => 'task2',
  step_type => 'single'
);
select pgflow.add_step(
  flow_slug => 'fail_test',
  step_slug => 'task3',
  step_type => 'single'
);

-- Start flow
select run_id as test_run_id2 from pgflow.start_flow('fail_test', '{}') \gset

-- Start some tasks to have mix of queued and started
select pgflow_tests.ensure_worker('fail_test', 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'worker_c');
SELECT * FROM pgflow_tests.read_and_start('fail_test', 1, 1,
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'worker_c') LIMIT 1;

select pgflow_tests.ensure_worker('fail_test', 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'worker_d');
SELECT * FROM pgflow_tests.read_and_start('fail_test', 1, 1,
  'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'worker_d') LIMIT 1;

-- Count messages before failure
select count(*) as queue_before2 from pgmq.q_fail_test \gset

-- Check we have both queued and started
select is(
  (select count(*)::int > 0 from pgflow.step_tasks
   where run_id = :'test_run_id2'::uuid
     and status = 'queued' and message_id is not null),
  true,
  'fail_test should have queued tasks with messages'
);

select is(
  (select count(*)::int > 0 from pgflow.step_tasks
   where run_id = :'test_run_id2'::uuid
     and status = 'started' and message_id is not null),
  true,
  'fail_test should have started tasks with messages'
);

-- Fail one task (with max_attempts=1, it will fail the run)
select lives_ok(
  format($$
    SELECT pgflow.fail_task('%s'::uuid, 'task1', 0, 'Test error')
  $$, :'test_run_id2'),
  'fail_task should handle run failure'
);

-- CRITICAL: All messages should be archived
select is(
  (select count(*) from pgmq.q_fail_test),
  0::bigint,
  'fail_task: Queue should be empty - ALL messages archived'
);

-- Verify run is failed
select is(
  (select status from pgflow.runs where run_id = :'test_run_id2'::uuid),
  'failed',
  'fail_task: Run should be marked as failed'
);

select * from finish();
rollback;