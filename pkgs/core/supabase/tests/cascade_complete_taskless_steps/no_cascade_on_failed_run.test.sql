-- Test that cascade_complete_taskless_steps returns 0 and does not cascade when run is failed
begin;

select plan(2);

-- Create test flow with cascade of taskless steps
select pgflow.create_flow('test_flow', max_attempts => 1);
select pgflow.add_step('test_flow', 'step1');
select pgflow.add_step('test_flow', 'step2', deps_slugs => ARRAY['step1']);

-- Start a flow run
select pgflow.start_flow('test_flow', '{"test": "data"}'::jsonb);

-- Get the run_id
select run_id from pgflow.runs where flow_slug = 'test_flow' limit 1 \gset

-- Get message ID for step1
select message_id as msg1 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'step1' limit 1 \gset

-- Ensure worker exists
select pgflow_tests.ensure_worker('test_flow');

-- Start and fail step1 which will fail the entire run
select pgflow.start_tasks('test_flow', ARRAY[:msg1]::bigint[], '11111111-1111-1111-1111-111111111111'::uuid);
select pgflow.fail_task(:'run_id', 'step1', 0, 'Simulated failure');

-- Call cascade_complete_taskless_steps directly on the failed run
-- It should return 0 without doing any cascading
select is(
  pgflow.cascade_complete_taskless_steps(:'run_id'),
  0,
  'cascade_complete_taskless_steps should return 0 when run is failed'
);

-- Verify run remains failed
select is(
  status,
  'failed',
  'Run should remain in failed status'
) from pgflow.runs where run_id = :'run_id';

select finish();
rollback;