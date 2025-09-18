-- Test that complete_task does not mutate state when run is already failed
-- This simulates a race condition where a task tries to complete after the run has failed
begin;

select plan(6);

-- Create test flow with two parallel steps (one will fail, one will try to complete)
select pgflow.create_flow('test_flow', max_attempts => 1);
select pgflow.add_step('test_flow', 'step1');
select pgflow.add_step('test_flow', 'step2');

-- Start a flow run
select pgflow.start_flow('test_flow', '{"test": "data"}'::jsonb);

-- Get the run_id
select run_id from pgflow.runs where flow_slug = 'test_flow' limit 1 \gset

-- Get message IDs for both steps
select message_id as msg1 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'step1' limit 1 \gset

select message_id as msg2 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'step2' limit 1 \gset

-- Ensure worker exists
select pgflow_tests.ensure_worker('test_flow');

-- Start both tasks (simulating workers picking them up)
select pgflow.start_tasks('test_flow', ARRAY[:msg1, :msg2]::bigint[], '11111111-1111-1111-1111-111111111111'::uuid);

-- Fail step2 which will fail the entire run (max_attempts=1)
select pgflow.fail_task(:'run_id', 'step2', 0, 'Simulated failure');

-- Now try to complete step1 (race condition - worker doesn't know run failed)
select pgflow.complete_task(:'run_id', 'step1', 0, '{"result": "test"}'::jsonb);

-- Verify task was NOT marked as completed
select is(
  status,
  'started',
  'Task should remain in started status when run is failed'
) from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'step1' and task_index = 0;

-- Verify output was NOT saved
select is(
  output,
  null,
  'Task output should not be saved when run is failed'
) from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'step1' and task_index = 0;

-- Verify step state was NOT changed to completed
select is(
  status,
  'started',
  'Step should remain in started status when run is failed'
) from pgflow.step_states
where run_id = :'run_id' and step_slug = 'step1';

-- Verify step2 is failed
select is(
  status,
  'failed',
  'Step2 should be in failed status'
) from pgflow.step_states
where run_id = :'run_id' and step_slug = 'step2';

-- Verify run is failed
select is(
  status,
  'failed',
  'Run should be in failed status'
) from pgflow.runs where run_id = :'run_id';

-- Verify step1 remains started (not completed)
select is(
  attempts_count,
  1,
  'Step1 attempts_count should be 1 after start_tasks'
) from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'step1' and task_index = 0;

select finish();
rollback;