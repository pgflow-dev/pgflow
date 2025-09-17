begin;
select plan(6);

-- Test: Map-to-map initial_tasks should only be set when dependency step completes
-- NOT when individual tasks complete

-- Setup
select pgflow_tests.reset_db();
select pgflow.create_flow('test_timing', 10, 60, 3);
select pgflow.add_step('test_timing', 'map1', '{}', null, null, null, null, 'map');
select pgflow.add_step('test_timing', 'map2', array['map1'], null, null, null, null, 'map');

-- Start flow with 4-item array
select is(
  (select count(*) from pgflow.start_flow('test_timing', '[10, 20, 30, 40]'::jsonb)),
  1::bigint,
  'Flow should start with 4-element array'
);

-- Verify map2 initial_tasks is NULL at start
select is(
  (select initial_tasks from pgflow.step_states
   where step_slug = 'map2'
   and run_id = (select run_id from pgflow.runs limit 1)),
  NULL::int,
  'Map2 initial_tasks should be NULL before map1 completes'
);

-- Complete ONLY ONE map1 task
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Complete just one task
  select * into v_task from pgflow_tests.read_and_start('test_timing', 1, 1);
  perform pgflow.complete_task(
    v_task.run_id,
    v_task.step_slug,
    0,  -- First task
    '100'::jsonb
  );
end $$;

-- CRITICAL TEST: Map2 initial_tasks should STILL be NULL after one task completes
select is(
  (select initial_tasks from pgflow.step_states
   where step_slug = 'map2'
   and run_id = (select run_id from pgflow.runs limit 1)),
  NULL::int,
  'Map2 initial_tasks should STILL be NULL after completing 1 of 4 map1 tasks'
);

-- Complete remaining 3 map1 tasks
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  v_task_index int;
  v_map2_initial int;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Complete tasks 2, 3, and 4
  for i in 2..4 loop
    select * into v_task from pgflow_tests.read_and_start('test_timing', 1, 1);

    -- Get task_index from step_tasks table
    select task_index into v_task_index
    from pgflow.step_tasks
    where run_id = v_task.run_id
      and step_slug = v_task.step_slug
      and message_id = v_task.msg_id;

    perform pgflow.complete_task(
      v_task.run_id,
      v_task.step_slug,
      v_task_index,
      to_jsonb(100 + v_task_index)
    );

    -- Check map2 initial_tasks after each completion
    select initial_tasks into v_map2_initial
    from pgflow.step_states
    where step_slug = 'map2' and run_id = v_run_id;

    raise notice 'After completing task % (index %): map2 initial_tasks = %', i, v_task_index, v_map2_initial;
  end loop;
end $$;

-- Debug: Show step states after completing all map1 tasks
do $$
declare
  v_map1_status text;
  v_map2_initial int;
  v_map1_tasks_completed int;
begin
  select status into v_map1_status
  from pgflow.step_states
  where step_slug = 'map1'
    and run_id = (select run_id from pgflow.runs limit 1);

  select initial_tasks into v_map2_initial
  from pgflow.step_states
  where step_slug = 'map2'
    and run_id = (select run_id from pgflow.runs limit 1);

  select count(*) into v_map1_tasks_completed
  from pgflow.step_tasks
  where step_slug = 'map1'
    and status = 'completed'
    and run_id = (select run_id from pgflow.runs limit 1);

  raise notice 'Map1 status: %, Map2 initial_tasks: %, Map1 completed tasks: %',
    v_map1_status, v_map2_initial, v_map1_tasks_completed;
end $$;

-- Verify map1 is now complete
select is(
  (select status from pgflow.step_states
   where step_slug = 'map1'
   and run_id = (select run_id from pgflow.runs limit 1)),
  'completed',
  'Map1 should be completed after all 4 tasks complete'
);

-- NOW map2 initial_tasks should be set to 4
select is(
  (select initial_tasks from pgflow.step_states
   where step_slug = 'map2'
   and run_id = (select run_id from pgflow.runs limit 1)),
  4::int,
  'Map2 initial_tasks should be 4 after map1 step completes'
);

-- Trigger ready steps to create map2 tasks
do $$
declare
  v_run_id uuid;
begin
  select run_id into v_run_id from pgflow.runs limit 1;
  perform pgflow.start_ready_steps(v_run_id);
end $$;

-- Verify correct number of map2 tasks created
select is(
  (select count(*) from pgflow.step_tasks where step_slug = 'map2'),
  4::bigint,
  'Should have exactly 4 map2 tasks created'
);

select * from finish();
rollback;