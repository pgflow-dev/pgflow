begin;
select plan(2);
select pgflow_tests.reset_db();

-- Setup: Create a flow with a map step
select pgflow.create_flow('test_null_output');
select pgflow.add_step('test_null_output', 'map_step', '{}', null, null, null, null, 'map');

-- Start the flow with a 3-element array
select pgflow.start_flow('test_null_output', '[1, 2, 3]'::jsonb);

-- Ensure worker exists
select pgflow_tests.ensure_worker('test_null_output');

-- Complete tasks with some NULL outputs
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  v_task_index int;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Complete task 0 with non-null
  select * into v_task from pgflow_tests.read_and_start('test_null_output', 1, 1);
  select task_index into v_task_index
  from pgflow.step_tasks
  where run_id = v_task.run_id
    and step_slug = v_task.step_slug
    and message_id = v_task.msg_id;
  perform pgflow.complete_task(
    v_task.run_id,
    v_task.step_slug,
    v_task_index,
    '"first"'::jsonb
  );

  -- Complete task 1 with NULL
  select * into v_task from pgflow_tests.read_and_start('test_null_output', 1, 1);
  select task_index into v_task_index
  from pgflow.step_tasks
  where run_id = v_task.run_id
    and step_slug = v_task.step_slug
    and message_id = v_task.msg_id;
  perform pgflow.complete_task(
    v_task.run_id,
    v_task.step_slug,
    v_task_index,
    null  -- NULL output
  );

  -- Complete task 2 with non-null
  select * into v_task from pgflow_tests.read_and_start('test_null_output', 1, 1);
  select task_index into v_task_index
  from pgflow.step_tasks
  where run_id = v_task.run_id
    and step_slug = v_task.step_slug
    and message_id = v_task.msg_id;
  perform pgflow.complete_task(
    v_task.run_id,
    v_task.step_slug,
    v_task_index,
    '"third"'::jsonb
  );
end $$;

-- Test 1: Verify the step is completed
select is(
  (select status from pgflow.step_states where step_slug = 'map_step'),
  'completed',
  'Map step should be marked as completed'
);

-- Test 2: NULL outputs should be preserved in the array
select is(
  (select output from pgflow.step_states where step_slug = 'map_step'),
  '["first", null, "third"]'::jsonb,
  'NULL outputs should be preserved in aggregated array'
);

select * from finish();
rollback;
