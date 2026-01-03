begin;
select plan(4);
select pgflow_tests.reset_db();

-- Setup: Create a flow with max_attempts=1 so task fails immediately
select pgflow.create_flow('test_fail_output', 1, 5, 60);
select pgflow.add_step('test_fail_output', 'step1');

-- Start the flow
select pgflow.start_flow('test_fail_output', '{"data": "test"}'::jsonb);

-- Ensure worker exists
select pgflow_tests.ensure_worker('test_fail_output');

-- Fail the task
do $$
declare
  v_task pgflow.step_task_record;
begin
  select * into v_task from pgflow_tests.read_and_start('test_fail_output', 1, 1);

  perform pgflow.fail_task(
    v_task.run_id,
    v_task.step_slug,
    0,
    'Test failure: Simulated error'
  );
end $$;

-- Test 1: Verify the step is marked as failed
select is(
  (select status from pgflow.step_states where step_slug = 'step1'),
  'failed',
  'Step should be marked as failed'
);

-- Test 2: Verify the step output is NULL
select is(
  (select output from pgflow.step_states where step_slug = 'step1'),
  null,
  'Failed step should have NULL output'
);

-- Test 3: Verify the run is also failed
select is(
  (select status from pgflow.runs limit 1),
  'failed',
  'Run should be failed when step fails'
);

-- Test 4: Attempting to set output on failed step should violate constraint
select throws_ok(
  $$
    UPDATE pgflow.step_states
    SET output = '{"test": true}'::jsonb
    WHERE step_slug = 'step1'
  $$,
  '23514',  -- check_violation error code
  'new row for relation "step_states" violates check constraint "output_only_for_completed_or_null"',
  'Cannot set output on failed step due to constraint'
);

select * from finish();
rollback;
