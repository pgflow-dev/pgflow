begin;
select plan(3);

-- Test: Dependent steps don't start until ALL map tasks complete
-- Even if start_ready_steps is called, it should wait for all tasks

-- Setup
select pgflow_tests.reset_db();
select pgflow.create_flow('test_partial', 10, 60, 3);
select pgflow.add_step('test_partial', 'map_step', '{}', null, null, null, null, 'map');
select pgflow.add_step('test_partial', 'dependent', array['map_step'], null, null, null, null, 'single');

-- Start flow with 5-element array
select is(
  (select count(*) from pgflow.start_flow('test_partial', '[1, 2, 3, 4, 5]'::jsonb)),
  1::bigint,
  'Flow should start with 5-element array'
);

-- Complete only 3 out of 5 tasks
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  v_task_index int;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Complete only 3 tasks (not all 5)
  for i in 1..3 loop
    select * into v_task from pgflow_tests.read_and_start('test_partial', 1, 1);

    -- Get task_index
    select task_index into v_task_index
    from pgflow.step_tasks
    where run_id = v_task.run_id
      and step_slug = v_task.step_slug
      and message_id = v_task.msg_id;

    -- Complete task
    perform pgflow.complete_task(
      v_task.run_id,
      v_task.step_slug,
      v_task_index,
      to_jsonb(v_task_index * 10)
    );
  end loop;

  -- Try to trigger dependent step (should not start yet)
  perform pgflow.start_ready_steps(v_run_id);
end $$;

-- Verify dependent step is NOT started
select is(
  (select count(*) from pgflow.step_tasks where step_slug = 'dependent'),
  0::bigint,
  'Dependent step should NOT have tasks when map is partially complete'
);

-- Now complete remaining tasks
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  v_task_index int;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Complete remaining 2 tasks
  for i in 1..2 loop
    select * into v_task from pgflow_tests.read_and_start('test_partial', 1, 1);

    -- Get task_index
    select task_index into v_task_index
    from pgflow.step_tasks
    where run_id = v_task.run_id
      and step_slug = v_task.step_slug
      and message_id = v_task.msg_id;

    -- Complete task
    perform pgflow.complete_task(
      v_task.run_id,
      v_task.step_slug,
      v_task_index,
      to_jsonb(v_task_index * 10)
    );
  end loop;

  -- Now trigger dependent step (should start)
  perform pgflow.start_ready_steps(v_run_id);
end $$;

-- Verify dependent step IS started after all map tasks complete
select is(
  (select count(*) from pgflow.step_tasks where step_slug = 'dependent'),
  1::bigint,
  'Dependent step should have 1 task after all map tasks complete'
);

select * from finish();
rollback;