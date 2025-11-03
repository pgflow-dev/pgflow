begin;
select plan(8);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database
select pgflow_tests.reset_db();

-- =========================================================================
-- Setup: Create flow with single step -> dependent map step
-- =========================================================================
select pgflow.create_flow('type_violation_test');
select pgflow.add_step('type_violation_test', 'producer');  -- Single step
select pgflow.add_step(
  'type_violation_test',
  'consumer_map',
  ARRAY['producer']::text[],
  NULL,  -- opt_max_attempts
  NULL,  -- opt_base_delay
  NULL,  -- opt_timeout
  NULL,  -- opt_start_delay
  'map'  -- step_type
);

-- Start the flow and capture the run_id
with flow as (
  select * from pgflow.start_flow('type_violation_test', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Poll for the producer task
with task as (
  select * from pgflow_tests.read_and_start('type_violation_test', 1, 1)
)
select * into temporary producer_tasks from task;

-- Complete the producer with INVALID output (object instead of array for dependent map)
-- This should trigger a type violation failure
select pgflow.complete_task(
  (select run_id from producer_tasks),
  (select step_slug from producer_tasks),
  0,
  '{"items": [1, 2, 3]}'::jsonb  -- Object, not array!
) into temporary completed_tasks;

-- =========================================================================
-- CRITICAL TESTS: Verify failure events ARE broadcast
-- These will FAIL until complete_task.sql is fixed!
-- =========================================================================

-- Test 1: Verify run status is failed in database (this should pass)
select is(
  (select status from pgflow.runs where run_id = (select run_id from run_ids)),
  'failed',
  '[Database State] Run should be marked as failed due to type violation'
);

-- Test 2: Verify producer step status is failed in database (this should pass)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'producer'),
  'failed',
  '[Database State] Producer step should be marked as failed due to type violation'
);

-- Test 3: Verify error message contains TYPE_VIOLATION (this should pass)
select ok(
  (select error_message from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'producer')
  LIKE '%TYPE_VIOLATION%',
  '[Database State] Step error message should indicate TYPE_VIOLATION'
);

-- Test 4: CRITICAL - Verify step:failed event was broadcast (WILL FAIL - BUG)
select is(
  pgflow_tests.count_realtime_events('step:failed', (select run_id from run_ids), 'producer'),
  1::int,
  '[MISSING EVENT] pgflow.complete_task should send step:failed event for type violation'
);

-- Test 5: CRITICAL - Verify run:failed event was broadcast (WILL FAIL - BUG)
select is(
  pgflow_tests.count_realtime_events('run:failed', (select run_id from run_ids)),
  1::int,
  '[MISSING EVENT] pgflow.complete_task should send run:failed event for type violation'
);

-- Test 6: Verify step:failed event contains correct status (WILL FAIL - no event)
select is(
  (select payload->>'status' from pgflow_tests.get_realtime_message('step:failed', (select run_id from run_ids), 'producer')),
  'failed',
  '[Event Payload] step:failed event should have status "failed"'
);

-- Test 7: Verify step:failed event contains error message (WILL FAIL - no event)
select ok(
  (select payload->>'error_message' from pgflow_tests.get_realtime_message('step:failed', (select run_id from run_ids), 'producer'))
  LIKE '%TYPE_VIOLATION%',
  '[Event Payload] step:failed event should include TYPE_VIOLATION error message'
);

-- Test 8: Verify run:failed event contains correct status (WILL FAIL - no event)
select is(
  (select payload->>'status' from pgflow_tests.get_realtime_message('run:failed', (select run_id from run_ids))),
  'failed',
  '[Event Payload] run:failed event should have status "failed"'
);

-- Clean up
drop table if exists run_ids;
drop table if exists producer_tasks;
drop table if exists completed_tasks;

select finish();
rollback;
