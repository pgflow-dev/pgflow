begin;
select plan(3);

-- Test: Performance with large arrays (same scale as other perf tests)
-- Uses 100 tasks to match baseline measurements

-- Setup
select pgflow_tests.reset_db();
select pgflow.create_flow('test_large', 10, 60, 3);
select pgflow.add_step('test_large', 'large_map', '{}', null, null, null, null, 'map');
select pgflow.add_step('test_large', 'consumer', array['large_map'], null, null, null, null, 'single');

-- Start flow with 100-element array
select is(
  (select count(*) from pgflow.start_flow('test_large',
    (select jsonb_agg(n) from generate_series(1, 100) n)
  )),
  1::bigint,
  'Flow should start with 100-element array'
);

-- Complete all 100 map tasks and measure aggregation
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  v_task_index int;
  v_start_time timestamp;
  v_duration interval;
  i int;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Complete all 100 tasks
  for i in 1..100 loop
    select * into v_task from pgflow_tests.read_and_start('test_large', 1, 1);

    -- Get task_index
    select task_index into v_task_index
    from pgflow.step_tasks
    where run_id = v_task.run_id
      and step_slug = v_task.step_slug
      and message_id = v_task.msg_id;

    -- Complete with simple output
    perform pgflow.complete_task(
      v_task.run_id,
      v_task.step_slug,
      v_task_index,
      to_jsonb(v_task_index * 10)
    );
  end loop;

  -- Measure time to trigger dependent step (with aggregation)
  v_start_time := clock_timestamp();
  perform pgflow.start_ready_steps(v_run_id);
  v_duration := clock_timestamp() - v_start_time;

  -- Check if performance is reasonable (< 10ms for 100 tasks)
  if extract(milliseconds from v_duration) + extract(seconds from v_duration) * 1000 > 10 then
    raise notice 'Aggregation took % ms for 100 tasks',
      round(extract(milliseconds from v_duration) + extract(seconds from v_duration) * 1000, 2);
  end if;
end $$;

-- Verify consumer receives complete aggregated array
select is(
  (select jsonb_array_length(input->'large_map')
   from pgflow_tests.read_and_start('test_large', 1, 1)),
  100,
  'Consumer should receive all 100 elements in aggregated array'
);

-- Complete consumer and check run completion with aggregation
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  v_start_time timestamp;
  v_duration interval;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Get consumer task
  select * into v_task from pgflow.step_tasks
  where run_id = v_run_id and step_slug = 'consumer' and status = 'started';

  -- Complete it
  perform pgflow.complete_task(
    v_task.run_id,
    v_task.step_slug,
    0,
    jsonb_build_object('processed', 100)
  );

  -- Measure run completion (shouldn't need to aggregate since consumer is leaf)
  v_start_time := clock_timestamp();
  perform pgflow.maybe_complete_run(v_run_id);
  v_duration := clock_timestamp() - v_start_time;

  -- Check if performance is reasonable (< 5ms)
  if extract(milliseconds from v_duration) + extract(seconds from v_duration) * 1000 > 5 then
    raise notice 'Run completion took % ms',
      round(extract(milliseconds from v_duration) + extract(seconds from v_duration) * 1000, 2);
  end if;
end $$;

-- Verify run completed successfully
select is(
  (select status from pgflow.runs limit 1),
  'completed',
  'Run should complete successfully with large array'
);

select * from finish();
rollback;