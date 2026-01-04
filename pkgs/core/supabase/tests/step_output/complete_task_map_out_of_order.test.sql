begin;
select plan(3);
select pgflow_tests.reset_db();

-- Setup: Create a flow with a map step
select pgflow.create_flow('test_map_order');
select pgflow.add_step('test_map_order', 'map_step', '{}', null, null, null, null, 'map');

-- Start the flow with a 3-element array
select pgflow.start_flow('test_map_order', '[100, 200, 300]'::jsonb);

-- Ensure worker exists
select pgflow_tests.ensure_worker('test_map_order');

-- Complete tasks OUT OF ORDER (2, 0, 1) with distinct outputs
-- This tests that step_states.output is ordered by task_index, not completion order
do $$
declare
  v_run_id uuid;
  v_tasks pgflow.step_task_record[];
  v_task pgflow.step_task_record;
  i int;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Read all 3 tasks first and store them
  for i in 1..3 loop
    select * into v_task from pgflow_tests.read_and_start('test_map_order', 1, 1);
    v_tasks := array_append(v_tasks, v_task);
  end loop;

  -- Complete task 2 first (index 2)
  perform pgflow.complete_task(
    v_tasks[3].run_id,
    v_tasks[3].step_slug,
    2,  -- task_index
    jsonb_build_object('value', 'result_2')
  );

  -- Complete task 0 second (index 0)
  perform pgflow.complete_task(
    v_tasks[1].run_id,
    v_tasks[1].step_slug,
    0,  -- task_index
    jsonb_build_object('value', 'result_0')
  );

  -- Complete task 1 last (index 1) - this triggers step completion
  perform pgflow.complete_task(
    v_tasks[2].run_id,
    v_tasks[2].step_slug,
    1,  -- task_index
    jsonb_build_object('value', 'result_1')
  );
end $$;

-- Test 1: Verify the step is completed
select is(
  (select status from pgflow.step_states where step_slug = 'map_step'),
  'completed',
  'Map step should be marked as completed'
);

-- Test 2: The step_state.output should be ordered by task_index (0, 1, 2)
-- NOT by completion order (2, 0, 1)
select is(
  (select output from pgflow.step_states where step_slug = 'map_step'),
  jsonb_build_array(
    jsonb_build_object('value', 'result_0'),
    jsonb_build_object('value', 'result_1'),
    jsonb_build_object('value', 'result_2')
  ),
  'Map step output should be ordered by task_index, not completion order'
);

-- Test 3: Verify remaining_tasks is 0
select is(
  (select remaining_tasks from pgflow.step_states where step_slug = 'map_step'),
  0,
  'remaining_tasks should be 0 after all tasks complete'
);

select * from finish();
rollback;
