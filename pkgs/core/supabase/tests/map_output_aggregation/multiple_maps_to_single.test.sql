begin;
select plan(2);

-- Test: Multiple map steps feeding into single step
-- Verify single step receives multiple aggregated arrays correctly

-- Setup: Use producer steps to create arrays for each map
-- (Can't have multiple root maps since flow input must be a single array)
select pgflow_tests.reset_db();
select pgflow.create_flow('test_multi_maps', 10, 60, 3);

-- Create producers for each array
select pgflow.add_step('test_multi_maps', 'producer_a', '{}', null, null, null, null, 'single');
select pgflow.add_step('test_multi_maps', 'producer_b', '{}', null, null, null, null, 'single');

-- Create dependent maps
select pgflow.add_step('test_multi_maps', 'map_a', array['producer_a'], null, null, null, null, 'map');
select pgflow.add_step('test_multi_maps', 'map_b', array['producer_b'], null, null, null, null, 'map');

-- Create collector depending on both maps
select pgflow.add_step('test_multi_maps', 'collector', array['map_a', 'map_b'], null, null, null, null, 'single');

-- Start flow
select is(
  (select count(*) from pgflow.start_flow('test_multi_maps', '{}'::jsonb)),
  1::bigint,
  'Flow should start successfully'
);

do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  v_task_index int;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Complete producer_a (outputs 3-element array)
  select * into v_task from pgflow_tests.read_and_start('test_multi_maps', 1, 1);
  perform pgflow.complete_task(
    v_task.run_id,
    v_task.step_slug,
    0,
    jsonb_build_array(10, 20, 30)
  );

  -- Complete producer_b (outputs 2-element array)
  select * into v_task from pgflow_tests.read_and_start('test_multi_maps', 1, 1);
  perform pgflow.complete_task(
    v_task.run_id,
    v_task.step_slug,
    0,
    jsonb_build_array('alpha', 'beta')
  );

  -- Trigger map steps
  perform pgflow.start_ready_steps(v_run_id);

  -- Complete map_a tasks (3 tasks)
  for i in 1..3 loop
    select * into v_task from pgflow_tests.read_and_start('test_multi_maps', 1, 1);

    select task_index into v_task_index
    from pgflow.step_tasks
    where run_id = v_task.run_id
      and step_slug = v_task.step_slug
      and message_id = v_task.msg_id;

    -- Transform by doubling
    perform pgflow.complete_task(
      v_task.run_id,
      v_task.step_slug,
      v_task_index,
      to_jsonb((v_task.input::int) * 2)
    );
  end loop;

  -- Complete map_b tasks (2 tasks)
  for i in 1..2 loop
    select * into v_task from pgflow_tests.read_and_start('test_multi_maps', 1, 1);

    select task_index into v_task_index
    from pgflow.step_tasks
    where run_id = v_task.run_id
      and step_slug = v_task.step_slug
      and message_id = v_task.msg_id;

    -- Transform by uppercasing
    perform pgflow.complete_task(
      v_task.run_id,
      v_task.step_slug,
      v_task_index,
      to_jsonb(upper(v_task.input#>>'{}'))
    );
  end loop;

  -- Trigger collector
  perform pgflow.start_ready_steps(v_run_id);
end $$;

-- Verify collector receives both aggregated arrays
-- Dependent steps only get dependency outputs (no 'run' key)
select is(
  (select input from pgflow_tests.read_and_start('test_multi_maps', 1, 1)),
  jsonb_build_object(
    'map_a', jsonb_build_array(20, 40, 60),
    'map_b', jsonb_build_array('ALPHA', 'BETA')
  ),
  'Collector should receive both aggregated arrays from multiple map dependencies'
);

select * from finish();
rollback;