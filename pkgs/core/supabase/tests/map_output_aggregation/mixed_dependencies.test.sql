begin;
select plan(2);

-- Test: Step depending on both map and single steps
-- Should receive both aggregated array and single output

-- Setup
select pgflow_tests.reset_db();
select pgflow.create_flow('test_mixed', 10, 60, 3);
-- Create an initial step that outputs array for the map
select pgflow.add_step('test_mixed', 'array_producer', '{}', null, null, null, null, 'single');
select pgflow.add_step('test_mixed', 'single_src', '{}', null, null, null, null, 'single');
select pgflow.add_step('test_mixed', 'map_src', array['array_producer'], null, null, null, null, 'map');
select pgflow.add_step('test_mixed', 'consumer', array['single_src', 'map_src'], null, null, null, null, 'single');

-- Start flow with object input
select is(
  (select count(*) from pgflow.start_flow('test_mixed',
    jsonb_build_object(
      'config', 'test'
    )
  )),
  1::bigint,
  'Flow should start with object input'
);

-- Complete initial steps
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  v_task_index int;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Complete array_producer task (produces array for map)
  select * into v_task from pgflow_tests.read_and_start('test_mixed', 1, 1);
  if v_task.step_slug != 'array_producer' then
    raise exception 'Expected array_producer, got %', v_task.step_slug;
  end if;
  perform pgflow.complete_task(
    v_task.run_id,
    v_task.step_slug,
    0,
    jsonb_build_array('a', 'b', 'c')  -- Output array for map_src
  );

  -- Complete single_src task
  select * into v_task from pgflow_tests.read_and_start('test_mixed', 1, 1);
  if v_task.step_slug != 'single_src' then
    raise exception 'Expected single_src, got %', v_task.step_slug;
  end if;
  perform pgflow.complete_task(
    v_task.run_id,
    v_task.step_slug,
    0,
    jsonb_build_object('processed', true, 'value', 100)
  );

  -- Trigger map_src steps
  perform pgflow.start_ready_steps(v_run_id);

  -- Complete map_src tasks (3 tasks for the 3-element array)
  for i in 1..3 loop
    select * into v_task from pgflow_tests.read_and_start('test_mixed', 1, 1);

    if v_task.step_slug != 'map_src' then
      raise exception 'Expected map_src, got %', v_task.step_slug;
    end if;

    -- Get task_index
    select task_index into v_task_index
    from pgflow.step_tasks
    where run_id = v_task.run_id
      and step_slug = v_task.step_slug
      and message_id = v_task.msg_id;

    -- Complete with uppercase transformation
    perform pgflow.complete_task(
      v_task.run_id,
      v_task.step_slug,
      v_task_index,
      to_jsonb(upper(v_task.input::text))  -- Convert input to uppercase
    );
  end loop;

  -- Trigger consumer step
  perform pgflow.start_ready_steps(v_run_id);
end $$;

-- Verify consumer receives both outputs correctly
select is(
  (select input from pgflow_tests.read_and_start('test_mixed', 1, 1)),
  jsonb_build_object(
    'run', jsonb_build_object('config', 'test'),
    'single_src', jsonb_build_object('processed', true, 'value', 100),
    'map_src', jsonb_build_array('"A"', '"B"', '"C"')  -- Strings are JSON encoded
  ),
  'Consumer should receive single output as object and map outputs as aggregated array'
);

select * from finish();
rollback;