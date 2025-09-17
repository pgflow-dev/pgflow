begin;
select plan(5);

-- Test: Map to map step dependency
-- Second map should receive aggregated array and each task gets element at its index

-- Setup
select pgflow_tests.reset_db();
select pgflow.create_flow('test_m2m', 10, 60, 3);
select pgflow.add_step('test_m2m', 'map1', '{}', null, null, null, null, 'map');
select pgflow.add_step('test_m2m', 'map2', array['map1'], null, null, null, null, 'map');
select pgflow.add_step('test_m2m', 'collector', array['map2'], null, null, null, null, 'single');

-- Start flow with 4-item array
select is(
  (select count(*) from pgflow.start_flow('test_m2m', '[10, 20, 30, 40]'::jsonb)),
  1::bigint,
  'Flow should start with 4-element array'
);

-- Complete first map tasks (transform by multiplying by 2)
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  v_task_index int;
  v_inputs int[] := array[10, 20, 30, 40];
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Complete all 4 map1 tasks
  for i in 1..4 loop
    select * into v_task from pgflow_tests.read_and_start('test_m2m', 1, 1);

    -- Get task_index from step_tasks table
    select task_index into v_task_index
    from pgflow.step_tasks
    where run_id = v_task.run_id
      and step_slug = v_task.step_slug
      and message_id = v_task.msg_id;

    -- Use the actual task_index from the task
    perform pgflow.complete_task(
      v_task.run_id,
      v_task.step_slug,
      v_task_index,
      to_jsonb(v_inputs[v_task_index + 1] * 2)  -- +1 because arrays are 1-indexed
    );
  end loop;

  -- Trigger map2 steps
  perform pgflow.start_ready_steps(v_run_id);
end $$;

-- Debug: Check if map2 tasks were created
select is(
  (select count(*) from pgflow.step_tasks where step_slug = 'map2'),
  4::bigint,
  'Should have 4 map2 tasks created'
);

-- Verify map2 tasks receive correct individual elements
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  v_task_index int;
  v_expected_inputs int[] := array[20, 40, 60, 80];
  i int;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Read and verify input for each map2 task
  for i in 1..4 loop
    select * into v_task from pgflow_tests.read_and_start('test_m2m', 1, 1);

    -- Verify this is map2
    if v_task.step_slug != 'map2' then
      raise exception 'Expected map2, got %', v_task.step_slug;
    end if;

    -- Get task_index from step_tasks table
    select task_index into v_task_index
    from pgflow.step_tasks
    where run_id = v_task.run_id
      and step_slug = v_task.step_slug
      and message_id = v_task.msg_id;

    -- Map tasks should receive raw elements based on their task_index
    -- The expected input is the element at task_index from the aggregated array
    if v_task.input != to_jsonb(v_expected_inputs[v_task_index + 1]) then
      raise exception 'Task % expected input %, got %',
        v_task_index, to_jsonb(v_expected_inputs[v_task_index + 1]), v_task.input;
    end if;

    -- Complete map2 task (transform by adding 100)
    perform pgflow.complete_task(
      v_task.run_id,
      v_task.step_slug,
      v_task_index,
      to_jsonb((v_expected_inputs[v_task_index + 1])::int + 100)
    );
  end loop;

  -- Trigger collector step
  perform pgflow.start_ready_steps(v_run_id);
end $$;

-- Test passes if we reach here without exceptions
select pass('Map2 tasks receive correct individual elements from map1 aggregation');

-- Debug: Check if map2 tasks are actually completed
select is(
  (select count(*) from pgflow.step_tasks
   where step_slug = 'map2'
   and status = 'completed'),
  4::bigint,
  'All 4 map2 tasks should be completed'
);

-- Verify collector receives map2's aggregated output
select is(
  (select input->'map2' from pgflow_tests.read_and_start('test_m2m', 1, 1)),
  jsonb_build_array(120, 140, 160, 180),
  'Collector should receive aggregated map2 outputs'
);

select * from finish();
rollback;