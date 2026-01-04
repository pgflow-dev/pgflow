begin;
select plan(3);
select pgflow_tests.reset_db();

-- Setup: Create a flow with a map step
select pgflow.create_flow('test_map_output');
select pgflow.add_step('test_map_output', 'map_step', '{}', null, null, null, null, 'map');

-- Start the flow with a 3-element array
select pgflow.start_flow('test_map_output', '[100, 200, 300]'::jsonb);

-- Ensure worker exists
select pgflow_tests.ensure_worker('test_map_output');

-- Complete tasks in order (0, 1, 2) with distinct outputs
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  v_task_index int;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Complete task 0
  select * into v_task from pgflow_tests.read_and_start('test_map_output', 1, 1);
  select task_index into v_task_index
  from pgflow.step_tasks
  where run_id = v_task.run_id
    and step_slug = v_task.step_slug
    and message_id = v_task.msg_id;
  perform pgflow.complete_task(
    v_task.run_id,
    v_task.step_slug,
    v_task_index,
    jsonb_build_object('value', 'result_0')
  );

  -- Complete task 1
  select * into v_task from pgflow_tests.read_and_start('test_map_output', 1, 1);
  select task_index into v_task_index
  from pgflow.step_tasks
  where run_id = v_task.run_id
    and step_slug = v_task.step_slug
    and message_id = v_task.msg_id;
  perform pgflow.complete_task(
    v_task.run_id,
    v_task.step_slug,
    v_task_index,
    jsonb_build_object('value', 'result_1')
  );

  -- Complete task 2 (final task - triggers step completion)
  select * into v_task from pgflow_tests.read_and_start('test_map_output', 1, 1);
  select task_index into v_task_index
  from pgflow.step_tasks
  where run_id = v_task.run_id
    and step_slug = v_task.step_slug
    and message_id = v_task.msg_id;
  perform pgflow.complete_task(
    v_task.run_id,
    v_task.step_slug,
    v_task_index,
    jsonb_build_object('value', 'result_2')
  );
end $$;

-- Test 1: Verify the step is completed
select is(
  (select status from pgflow.step_states where step_slug = 'map_step'),
  'completed',
  'Map step should be marked as completed'
);

-- Test 2: The step_state.output should have aggregated array ordered by task_index
select is(
  (select output from pgflow.step_states where step_slug = 'map_step'),
  jsonb_build_array(
    jsonb_build_object('value', 'result_0'),
    jsonb_build_object('value', 'result_1'),
    jsonb_build_object('value', 'result_2')
  ),
  'Map step should store aggregated array ordered by task_index'
);

-- Test 3: Verify remaining_tasks is 0
select is(
  (select remaining_tasks from pgflow.step_states where step_slug = 'map_step'),
  0,
  'remaining_tasks should be 0 after all tasks complete'
);

select * from finish();
rollback;
