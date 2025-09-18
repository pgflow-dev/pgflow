begin;
select plan(3);

-- Test: Basic map output aggregation
-- Map tasks outputs should be aggregated into an array for dependent steps

-- Setup
select pgflow_tests.reset_db();
select pgflow.create_flow('test_agg', 10, 60, 3);
select pgflow.add_step('test_agg', 'map_step', '{}', null, null, null, null, 'map');
select pgflow.add_step('test_agg', 'single_step', array['map_step'], null, null, null, null, 'single');

-- Start flow with 3-item array
select is(
  (select count(*) from pgflow.start_flow('test_agg', '[10, 20, 30]'::jsonb)),
  1::bigint,
  'Flow should start successfully'
);

-- Complete all 3 map tasks with different outputs
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  i int;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Complete map tasks with outputs that include the index
  for i in 1..3 loop
    select * into v_task from pgflow_tests.read_and_start('test_agg', 1, 1);
    perform pgflow.complete_task(
      v_task.run_id,
      v_task.step_slug,
      i - 1,  -- task_index (0-based)
      jsonb_build_object('result', i * 100)  -- outputs: {result:100}, {result:200}, {result:300}
    );
  end loop;

  -- Trigger dependent step
  perform pgflow.start_ready_steps(v_run_id);
end $$;

-- Check that single_step receives aggregated array as input
select is(
  (select input from pgflow_tests.read_and_start('test_agg', 1, 1)),
  jsonb_build_object(
    'run', '[10, 20, 30]'::jsonb,
    'map_step', jsonb_build_array(
      jsonb_build_object('result', 100),
      jsonb_build_object('result', 200),
      jsonb_build_object('result', 300)
    )
  ),
  'Single step should receive aggregated map outputs as array'
);

-- Verify the aggregated output is stored correctly
select is(
  (select count(*)
   from pgflow.step_states
   where step_slug = 'map_step'
     and status = 'completed'),
  1::bigint,
  'Map step should be completed'
);

select * from finish();
rollback;