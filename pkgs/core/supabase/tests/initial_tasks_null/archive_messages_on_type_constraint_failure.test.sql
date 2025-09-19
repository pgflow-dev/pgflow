begin;
select plan(8);
select pgflow_tests.reset_db();

-- Test: Type constraint violation should archive all pending messages for the run

-- Create flow with single -> map dependency where map has multiple downstream steps
select pgflow.create_flow('type_constraint_test');

select pgflow.add_step(
  flow_slug => 'type_constraint_test',
  step_slug => 'producer',
  step_type => 'single'
);

select pgflow.add_step(
  flow_slug => 'type_constraint_test',
  step_slug => 'map_consumer',
  deps_slugs => ARRAY['producer'],
  step_type => 'map'
);

-- Add a parallel single step to verify all pending messages are archived
select pgflow.add_step(
  flow_slug => 'type_constraint_test',
  step_slug => 'parallel_single',
  deps_slugs => ARRAY['producer'],
  step_type => 'single'
);

select run_id as test_run_id from pgflow.start_flow(
  'type_constraint_test',
  '{}'::jsonb
) \gset

-- Verify initial state: 1 message in queue (only root producer starts immediately)
select is(
  (select count(*) from pgmq.q_type_constraint_test),
  1::bigint,
  'Should have 1 message in queue initially (only producer as root step)'
);

-- Test: Map starts with NULL initial_tasks
select is(
  (select initial_tasks from pgflow.step_states
   where run_id = :'test_run_id'::uuid
     and step_slug = 'map_consumer'),
  NULL::integer,
  'Dependent map should start with NULL initial_tasks'
);

-- Ensure worker exists for polling
select pgflow_tests.ensure_worker('type_constraint_test');

-- Start the producer task (simulating Edge Worker behavior)
-- Since producer is the only root step, it will be the one started
WITH task AS (
  SELECT * FROM pgflow_tests.read_and_start('type_constraint_test', 1, 1)
  LIMIT 1
)
SELECT step_slug FROM task;

-- Get the producer task message_id for verification
select message_id as producer_msg_id from pgflow.step_tasks
where run_id = :'test_run_id'::uuid
  and step_slug = 'producer' \gset

-- Test: complete_task should handle type violation gracefully (no exception)
select lives_ok(
  format($$
    SELECT pgflow.complete_task(
      '%s'::uuid,
      'producer',
      0,
      '{"not": "an array"}'::jsonb
    )
  $$, :'test_run_id'),
  'complete_task should handle type violation gracefully without throwing exception'
);

-- CRITICAL TEST: Queue should be empty after type constraint violation (if archiving is implemented)
-- Currently this will fail because archiving is not implemented
select is(
  (select count(*) from pgmq.q_type_constraint_test),
  0::bigint,
  'Queue should be empty after type constraint violation (all pending messages archived)'
);

-- Test: Verify if any messages were archived
-- This will also fail because archiving is not implemented
select ok(
  (select count(*) from pgmq.a_type_constraint_test) > 0,
  'Some messages should be in archive table after type constraint violation'
);

-- Test: Run status after type constraint violation
-- Currently the run won't be marked as failed (transaction rolled back)
select is(
  (select status from pgflow.runs where run_id = :'test_run_id'::uuid),
  'failed',
  'Run should be marked as failed after type constraint violation'
);

-- Test: Map initial_tasks should remain NULL after failed transaction
select is(
  (select initial_tasks from pgflow.step_states
   where run_id = :'test_run_id'::uuid
     and step_slug = 'map_consumer'),
  NULL,
  'Map initial_tasks should remain NULL after type constraint violation'
);

-- Test: Check if parallel_single task exists
-- After the transaction rollback, parallel_single won't be created
select is(
  (select count(*)::integer from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid
     and step_slug = 'parallel_single'),
  0,
  'Parallel single task should not exist after type constraint violation (transaction rolled back)'
);

select * from finish();
rollback;