begin;
select plan(4);

-- Test: Deep chain of 10 map steps
-- Verify aggregation/decomposition works correctly through deep chains

-- Setup
select pgflow_tests.reset_db();
select pgflow.create_flow('deep_chain', 10, 60, 3);

-- Create chain of 10 map steps
select pgflow.add_step('deep_chain', 'map1', '{}', null, null, null, null, 'map');
select pgflow.add_step('deep_chain', 'map2', array['map1'], null, null, null, null, 'map');
select pgflow.add_step('deep_chain', 'map3', array['map2'], null, null, null, null, 'map');
select pgflow.add_step('deep_chain', 'map4', array['map3'], null, null, null, null, 'map');
select pgflow.add_step('deep_chain', 'map5', array['map4'], null, null, null, null, 'map');
select pgflow.add_step('deep_chain', 'map6', array['map5'], null, null, null, null, 'map');
select pgflow.add_step('deep_chain', 'map7', array['map6'], null, null, null, null, 'map');
select pgflow.add_step('deep_chain', 'map8', array['map7'], null, null, null, null, 'map');
select pgflow.add_step('deep_chain', 'map9', array['map8'], null, null, null, null, 'map');
select pgflow.add_step('deep_chain', 'map10', array['map9'], null, null, null, null, 'map');
select pgflow.add_step('deep_chain', 'final_collector', array['map10'], null, null, null, null, 'single');

-- Start flow with 3-element array
select is(
  (select count(*) from pgflow.start_flow('deep_chain', '[1, 2, 3]'::jsonb)),
  1::bigint,
  'Flow should start with 3-element array'
);

-- Process all 10 map steps
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  v_task_index int;
  v_expected_step text;
  v_map_num int;
  v_total_tasks_completed int := 0;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Process each map level (10 maps * 3 tasks each = 30 tasks total)
  for v_map_num in 1..10 loop
    v_expected_step := 'map' || v_map_num;

    -- Complete 3 tasks for current map
    for i in 1..3 loop
      select * into v_task from pgflow_tests.read_and_start('deep_chain', 1, 1);

      -- Verify we're processing the expected map step
      if v_task.step_slug != v_expected_step then
        raise exception 'Expected %, got %', v_expected_step, v_task.step_slug;
      end if;

      -- Get task_index
      select task_index into v_task_index
      from pgflow.step_tasks
      where run_id = v_task.run_id
        and step_slug = v_task.step_slug
        and message_id = v_task.msg_id;

      -- Transform: each map adds 10 to the value
      -- Input at map1: 1, 2, 3
      -- Output at map1: 11, 12, 13
      -- Output at map2: 21, 22, 23
      -- ...
      -- Output at map10: 101, 102, 103
      perform pgflow.complete_task(
        v_task.run_id,
        v_task.step_slug,
        v_task_index,
        to_jsonb((v_task.input::int) + 10)
      );

      v_total_tasks_completed := v_total_tasks_completed + 1;
    end loop;

    -- Trigger next map in chain
    perform pgflow.start_ready_steps(v_run_id);
  end loop;

  raise notice 'Completed % tasks across 10 maps', v_total_tasks_completed;
end $$;

-- Verify all 30 tasks were created and completed
select is(
  (select count(*) from pgflow.step_tasks where status = 'completed'),
  30::bigint,
  'Should have completed exactly 30 tasks (10 maps * 3 tasks each)'
);

-- Verify the final collector receives correctly transformed array
select is(
  (select input->'map10' from pgflow_tests.read_and_start('deep_chain', 1, 1)),
  jsonb_build_array(101, 102, 103),
  'Final collector should receive array transformed 10 times (+10 each time)'
);

-- Verify chain propagation: check a few intermediate steps had correct initial_tasks
select is(
  (select array_agg(initial_tasks order by step_slug)
   from pgflow.step_states
   where step_slug in ('map5', 'map7', 'map10')
     and run_id = (select run_id from pgflow.runs limit 1)),
  array[3, 3, 3],
  'All dependent maps should have initial_tasks = 3'
);

select * from finish();
rollback;