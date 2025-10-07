begin;
select plan(3);

-- Test: Concurrent completion of map tasks
-- Verify aggregation is correct when multiple tasks complete simultaneously

-- Setup
select pgflow_tests.reset_db();
select pgflow.create_flow('test_concurrent', 10, 60, 3);
select pgflow.add_step('test_concurrent', 'map_step', '{}', null, null, null, null, 'map');
select pgflow.add_step('test_concurrent', 'consumer', array['map_step'], null, null, null, null, 'single');

-- Start flow with 10-element array (larger to increase chance of race conditions)
select is(
  (select count(*) from pgflow.start_flow('test_concurrent', '[1,2,3,4,5,6,7,8,9,10]'::jsonb)),
  1::bigint,
  'Flow should start with 10-element array'
);

-- Start all tasks first (simulating multiple workers grabbing tasks)
do $$
declare
  v_tasks pgflow.step_task_record[];
  v_task pgflow.step_task_record;
  v_order int[] := array[5,1,8,3,9,2,7,4,10,6];
  v_idx int;
  i int;
begin
  -- Read and start all 10 tasks (simulating 10 concurrent workers)
  for i in 1..10 loop
    select * into v_task from pgflow_tests.read_and_start('test_concurrent', 1, 1);
    v_tasks := array_append(v_tasks, v_task);
  end loop;

  -- Now complete them all in rapid succession (simulating concurrent completions)
  -- Complete in a mixed order to test ordering preservation
  foreach v_idx in array v_order loop
    perform pgflow.complete_task(
      v_tasks[v_idx].run_id,
      v_tasks[v_idx].step_slug,
      v_idx - 1,  -- task_index is 0-based
      to_jsonb(v_idx * 100)  -- outputs: 100, 200, 300, etc.
    );
  end loop;

  -- Trigger dependent step
  perform pgflow.start_ready_steps(v_tasks[1].run_id);
end $$;

-- Verify the aggregation is correct despite concurrent completions
select is(
  (select input->'map_step' from pgflow_tests.read_and_start('test_concurrent', 1, 1)),
  jsonb_build_array(100, 200, 300, 400, 500, 600, 700, 800, 900, 1000),
  'Aggregated array should be in correct order despite mixed completion order'
);

-- Verify step completed successfully with all tasks
select is(
  (select count(*) from pgflow.step_tasks
   where step_slug = 'map_step'
     and status = 'completed'),
  10::bigint,
  'All 10 map tasks should be completed'
);

select * from finish();
rollback;