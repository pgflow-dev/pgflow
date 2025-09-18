begin;
select plan(8);
select pgflow_tests.reset_db();

-- Test: fail_task should archive all sibling task messages for map steps

-- Create flow with a map step
select pgflow.create_flow('test_map_fail');
select pgflow.add_step(
  flow_slug => 'test_map_fail',
  step_slug => 'map_step',
  step_type => 'map',
  max_attempts => 1
);

-- Start flow with 5 array elements
select run_id as test_run_id from pgflow.start_flow('test_map_fail', '["a", "b", "c", "d", "e"]'::jsonb) \gset

-- Verify all 5 messages are in queue
select is(
  (select count(*) from pgmq.q_test_map_fail),
  5::bigint,
  'Should have 5 messages in queue for 5 map tasks'
);

-- Verify all 5 tasks are created
select is(
  (select count(*)::integer from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid
     and step_slug = 'map_step'
     and status = 'queued'),
  5,
  'Should have 5 queued tasks'
);

-- Ensure worker exists for polling
select pgflow_tests.ensure_worker('test_map_fail');

-- Start task 0 (simulating Edge Worker behavior)
-- Note: read_and_start will start one of the tasks (we'll use it for testing)
WITH task AS (
  SELECT * FROM pgflow_tests.read_and_start('test_map_fail', 1, 1)
  LIMIT 1
)
SELECT step_slug FROM task;

-- Get the actual task_index of the started task for later reference
select task_index as started_task_index from pgflow.step_tasks
where run_id = :'test_run_id'::uuid
  and step_slug = 'map_step'
  and status = 'started' \gset

-- Fail the started task
select pgflow.fail_task(
  :'test_run_id'::uuid,
  'map_step',
  :'started_task_index'::integer,
  'Task failed!'
);

-- Test: Run should be marked as failed
select is(
  (select status from pgflow.runs where run_id = :'test_run_id'::uuid),
  'failed',
  'Run should be marked as failed after task failure'
);

-- Test: Failed task should have status 'failed'
select is(
  (select status from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid
     and step_slug = 'map_step'
     and task_index = :'started_task_index'::integer),
  'failed',
  'Started task should be marked as failed'
);

-- CRITICAL TEST: All sibling task messages should be archived (removed from queue)
select is(
  (select count(*) from pgmq.q_test_map_fail),
  0::bigint,
  'All 5 messages should be archived (removed from queue) when one map task fails'
);

-- Test: Verify messages were actually archived, not deleted
select is(
  (select count(*) from pgmq.a_test_map_fail),
  5::bigint,
  'All 5 messages should be in archive table'
);

-- Test: All sibling tasks should remain in 'queued' status
select is(
  (select count(*)::integer from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid
     and step_slug = 'map_step'
     and task_index != :'started_task_index'::integer
     and status = 'queued'),
  4,
  'Sibling tasks should remain in queued status'
);

-- Test: Step state should be marked as failed
select is(
  (select status from pgflow.step_states
   where run_id = :'test_run_id'::uuid
     and step_slug = 'map_step'),
  'failed',
  'Map step should be marked as failed'
);

select * from finish();
rollback;