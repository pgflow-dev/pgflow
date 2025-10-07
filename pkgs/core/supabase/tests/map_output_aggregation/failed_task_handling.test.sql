begin;
select plan(4);

-- Test: Failed task in map step should fail run and prevent other tasks from starting
-- MVP approach: fail entire run when any task fails

-- Setup
select pgflow_tests.reset_db();
-- Create flow with max_attempts=1 so tasks fail immediately
select pgflow.create_flow('test_fail', 1, 5, 60);
select pgflow.add_step('test_fail', 'map_step', '{}', null, null, null, null, 'map');
select pgflow.add_step('test_fail', 'dependent', array['map_step'], null, null, null, null, 'single');

-- Start flow with 5-element array
select is(
  (select count(*) from pgflow.start_flow('test_fail', '[1, 2, 3, 4, 5]'::jsonb)),
  1::bigint,
  'Flow should start with 5-element array'
);

-- Complete 2 tasks successfully, then fail one
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  v_task_index int;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Complete 2 tasks successfully
  for i in 1..2 loop
    select * into v_task from pgflow_tests.read_and_start('test_fail', 1, 1);

    -- Get task_index
    select task_index into v_task_index
    from pgflow.step_tasks
    where run_id = v_task.run_id
      and step_slug = v_task.step_slug
      and message_id = v_task.msg_id;

    -- Complete task successfully
    perform pgflow.complete_task(
      v_task.run_id,
      v_task.step_slug,
      v_task_index,
      to_jsonb(v_task_index * 10)
    );
  end loop;

  -- Now fail the third task
  select * into v_task from pgflow_tests.read_and_start('test_fail', 1, 1);

  select task_index into v_task_index
  from pgflow.step_tasks
  where run_id = v_task.run_id
    and step_slug = v_task.step_slug
    and message_id = v_task.msg_id;

  -- Fail the task
  perform pgflow.fail_task(
    v_task.run_id,
    v_task.step_slug,
    v_task_index,
    'Test failure: Simulated error'
  );
end $$;

-- Verify run is marked as failed
select is(
  (select status from pgflow.runs limit 1),
  'failed',
  'Run should be marked as failed when any task fails'
);

-- Try to start another task (should be prevented)
do $$
declare
  v_task pgflow.step_task_record;
begin
  select * into v_task from pgflow_tests.read_and_start('test_fail', 1, 1);

  if v_task.step_slug is not null then
    raise exception 'Should not be able to start tasks on failed run, but got task for %', v_task.step_slug;
  end if;
end $$;

-- This test passes if we reach here
select pass('Tasks cannot be started on failed run');

-- Verify dependent step never starts
select is(
  (select count(*) from pgflow.step_tasks where step_slug = 'dependent'),
  0::bigint,
  'Dependent step should not start when run is failed'
);

select * from finish();
rollback;