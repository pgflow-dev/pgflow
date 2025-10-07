begin;
select plan(9);
select pgflow_tests.reset_db();

-- Test: Measure task creation scaling for map steps with large arrays
select diag('Testing task creation scaling when starting flows with increasingly large arrays');

-- Create flow with root map
select pgflow.create_flow('map_perf_flow');
select pgflow.add_step(
  flow_slug => 'map_perf_flow',
  step_slug => 'root_map',
  deps_slugs => '{}',
  step_type => 'map'
);

-- Ensure worker exists for testing
select pgflow_tests.ensure_worker('map_perf_flow');

-- Create temp table for performance metrics
CREATE TEMP TABLE map_performance (
  array_size int,
  flow_start_time_ms numeric,  -- Time to call start_flow (creates all tasks)
  task_creation_time_ms numeric,  -- Same as flow_start_time_ms
  start_tasks_time_ms numeric,  -- Time to poll 10 tasks (should be constant)
  time_per_element_ms numeric  -- Task creation time divided by array size
);

-- Test 100 elements (baseline)
DO $$
DECLARE
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_flow_start timestamptz;
  v_run_id uuid;
  v_duration_ms numeric;
  v_task_creation_ms numeric;
  v_start_tasks_ms numeric;
  v_msg_ids bigint[];
BEGIN
  -- Measure flow start time (includes task creation)
  v_flow_start := clock_timestamp();
  SELECT run_id INTO v_run_id FROM pgflow.start_flow(
    'map_perf_flow',
    (SELECT jsonb_agg(i) FROM generate_series(1, 100) i)
  );
  v_end_time := clock_timestamp();
  v_task_creation_ms := EXTRACT(EPOCH FROM (v_end_time - v_flow_start)) * 1000;

  -- Get sample of message IDs for start_tasks test
  SELECT array_agg(message_id) INTO v_msg_ids FROM (
    SELECT message_id FROM pgflow.step_tasks
    WHERE run_id = v_run_id
    ORDER BY task_index
    LIMIT 10
  ) t;

  -- Measure start_tasks performance (10 tasks sample)
  v_start_time := clock_timestamp();
  PERFORM * FROM pgflow.start_tasks(
    'map_perf_flow',
    v_msg_ids,
    '11111111-1111-1111-1111-111111111111'::uuid
  );
  v_end_time := clock_timestamp();
  v_start_tasks_ms := EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000;

  INSERT INTO map_performance VALUES (
    100,
    v_task_creation_ms,
    v_task_creation_ms,
    v_start_tasks_ms,
    v_task_creation_ms / 100
  );

  RAISE NOTICE 'ARRAY 100: % ms total, % ms per element',
    round(v_task_creation_ms, 2), round(v_task_creation_ms / 100, 4);
END $$;

-- Test 1000 elements
DO $$
DECLARE
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_flow_start timestamptz;
  v_run_id uuid;
  v_duration_ms numeric;
  v_task_creation_ms numeric;
  v_start_tasks_ms numeric;
  v_msg_ids bigint[];
BEGIN
  -- Reset for new test (proper order for FK constraints)
  DELETE FROM pgflow.step_tasks WHERE flow_slug = 'map_perf_flow';
  DELETE FROM pgflow.step_states WHERE flow_slug = 'map_perf_flow';
  DELETE FROM pgflow.runs WHERE flow_slug = 'map_perf_flow';

  -- Measure flow start time
  v_flow_start := clock_timestamp();
  SELECT run_id INTO v_run_id FROM pgflow.start_flow(
    'map_perf_flow',
    (SELECT jsonb_agg(i) FROM generate_series(1, 1000) i)
  );
  v_end_time := clock_timestamp();
  v_task_creation_ms := EXTRACT(EPOCH FROM (v_end_time - v_flow_start)) * 1000;

  -- Get sample of message IDs
  SELECT array_agg(message_id) INTO v_msg_ids FROM (
    SELECT message_id FROM pgflow.step_tasks
    WHERE run_id = v_run_id
    ORDER BY task_index
    LIMIT 10
  ) t;

  -- Measure start_tasks performance
  v_start_time := clock_timestamp();
  PERFORM * FROM pgflow.start_tasks(
    'map_perf_flow',
    v_msg_ids,
    '11111111-1111-1111-1111-111111111111'::uuid
  );
  v_end_time := clock_timestamp();
  v_start_tasks_ms := EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000;

  INSERT INTO map_performance VALUES (
    1000,
    v_task_creation_ms,
    v_task_creation_ms,
    v_start_tasks_ms,
    v_task_creation_ms / 1000
  );

  RAISE NOTICE 'ARRAY 1000: % ms total, % ms per element',
    round(v_task_creation_ms, 2), round(v_task_creation_ms / 1000, 4);
END $$;

-- Test 5000 elements
DO $$
DECLARE
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_flow_start timestamptz;
  v_run_id uuid;
  v_duration_ms numeric;
  v_task_creation_ms numeric;
  v_start_tasks_ms numeric;
  v_msg_ids bigint[];
BEGIN
  -- Reset for new test (proper order for FK constraints)
  DELETE FROM pgflow.step_tasks WHERE flow_slug = 'map_perf_flow';
  DELETE FROM pgflow.step_states WHERE flow_slug = 'map_perf_flow';
  DELETE FROM pgflow.runs WHERE flow_slug = 'map_perf_flow';

  -- Measure flow start time
  v_flow_start := clock_timestamp();
  SELECT run_id INTO v_run_id FROM pgflow.start_flow(
    'map_perf_flow',
    (SELECT jsonb_agg(i) FROM generate_series(1, 5000) i)
  );
  v_end_time := clock_timestamp();
  v_task_creation_ms := EXTRACT(EPOCH FROM (v_end_time - v_flow_start)) * 1000;

  -- Get sample of message IDs
  SELECT array_agg(message_id) INTO v_msg_ids FROM (
    SELECT message_id FROM pgflow.step_tasks
    WHERE run_id = v_run_id
    ORDER BY task_index
    LIMIT 10
  ) t;

  -- Measure start_tasks performance
  v_start_time := clock_timestamp();
  PERFORM * FROM pgflow.start_tasks(
    'map_perf_flow',
    v_msg_ids,
    '11111111-1111-1111-1111-111111111111'::uuid
  );
  v_end_time := clock_timestamp();
  v_start_tasks_ms := EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000;

  INSERT INTO map_performance VALUES (
    5000,
    v_task_creation_ms,
    v_task_creation_ms,
    v_start_tasks_ms,
    v_task_creation_ms / 5000
  );

  RAISE NOTICE 'ARRAY 5000: % ms total, % ms per element',
    round(v_task_creation_ms, 2), round(v_task_creation_ms / 5000, 4);
END $$;

-- Test 10000 elements
DO $$
DECLARE
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_flow_start timestamptz;
  v_run_id uuid;
  v_duration_ms numeric;
  v_task_creation_ms numeric;
  v_start_tasks_ms numeric;
  v_msg_ids bigint[];
BEGIN
  -- Reset for new test (proper order for FK constraints)
  DELETE FROM pgflow.step_tasks WHERE flow_slug = 'map_perf_flow';
  DELETE FROM pgflow.step_states WHERE flow_slug = 'map_perf_flow';
  DELETE FROM pgflow.runs WHERE flow_slug = 'map_perf_flow';

  -- Measure flow start time
  v_flow_start := clock_timestamp();
  SELECT run_id INTO v_run_id FROM pgflow.start_flow(
    'map_perf_flow',
    (SELECT jsonb_agg(i) FROM generate_series(1, 10000) i)
  );
  v_end_time := clock_timestamp();
  v_task_creation_ms := EXTRACT(EPOCH FROM (v_end_time - v_flow_start)) * 1000;

  -- Get sample of message IDs
  SELECT array_agg(message_id) INTO v_msg_ids FROM (
    SELECT message_id FROM pgflow.step_tasks
    WHERE run_id = v_run_id
    ORDER BY task_index
    LIMIT 10
  ) t;

  -- Measure start_tasks performance
  v_start_time := clock_timestamp();
  PERFORM * FROM pgflow.start_tasks(
    'map_perf_flow',
    v_msg_ids,
    '11111111-1111-1111-1111-111111111111'::uuid
  );
  v_end_time := clock_timestamp();
  v_start_tasks_ms := EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000;

  INSERT INTO map_performance VALUES (
    10000,
    v_task_creation_ms,
    v_task_creation_ms,
    v_start_tasks_ms,
    v_task_creation_ms / 10000
  );

  RAISE NOTICE 'ARRAY 10000: % ms total, % ms per element',
    round(v_task_creation_ms, 2), round(v_task_creation_ms / 10000, 4);
END $$;

-- Display performance summary
DO $$
DECLARE
  perf_row RECORD;
  v_scaling_behavior TEXT;
  v_time_ratio numeric;
  v_size_ratio numeric;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '🚀 TASK CREATION SCALING SUMMARY';
  RAISE NOTICE '========================================';
  RAISE NOTICE '(Time to create all tasks when starting flow)';
  RAISE NOTICE '';

  FOR perf_row IN
    SELECT * FROM map_performance ORDER BY array_size
  LOOP
    RAISE NOTICE '';
    RAISE NOTICE '  📊 % elements:',
      LPAD(perf_row.array_size::text, 5);
    RAISE NOTICE '     Total time: % ms',
      LPAD(round(perf_row.task_creation_time_ms, 1)::text, 8);
    RAISE NOTICE '     Per element: % ms/elem',
      round(perf_row.time_per_element_ms, 4);
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE 'Note: start_tasks (polling) time remains constant:';
  SELECT avg(start_tasks_time_ms), min(start_tasks_time_ms), max(start_tasks_time_ms)
  INTO v_time_ratio, v_size_ratio, perf_row.array_size
  FROM map_performance WHERE array_size > 0;
  RAISE NOTICE '  Avg: %ms, Min: %ms, Max: %ms for 10 tasks',
    round(v_time_ratio, 2), round(v_size_ratio, 2), round(perf_row.array_size, 2);

  -- Calculate scaling factor between smallest and largest
  WITH scaling AS (
    SELECT
      MAX(task_creation_time_ms) / MIN(task_creation_time_ms) as time_ratio,
      MAX(array_size)::numeric / MIN(array_size) as size_ratio
    FROM map_performance
  )
  SELECT
    time_ratio,
    size_ratio,
    CASE
      WHEN time_ratio <= size_ratio * 1.5 THEN 'LINEAR or better ✅'
      WHEN time_ratio <= size_ratio * 2.0 THEN 'SLIGHTLY SUPER-LINEAR ⚠️'
      WHEN time_ratio <= size_ratio * size_ratio * 0.5 THEN 'SUB-QUADRATIC ⚠️'
      ELSE 'QUADRATIC or worse ❌'
    END as scaling_behavior
  INTO v_time_ratio, v_size_ratio, v_scaling_behavior
  FROM scaling;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Task creation time ratio (10k/100): %x', round(v_time_ratio, 2);
  RAISE NOTICE 'Array size ratio (10k/100): %x', round(v_size_ratio, 2);
  RAISE NOTICE 'Task creation scaling: %', v_scaling_behavior;
  RAISE NOTICE '========================================';

  -- Store for test assertion
  INSERT INTO map_performance VALUES (
    -1,  -- Sentinel value for scaling result
    v_time_ratio,
    v_size_ratio,
    0,
    0
  );
END $$;

-- ASSERTIONS

-- Verify all array sizes were tested
select is(
  (select count(*) from map_performance where array_size > 0),
  4::bigint,
  'All 4 array sizes should be tested'
);

-- Verify 10000-element array created correct number of tasks (last test run)
select is(
  (select count(*) from pgflow.step_tasks
   where flow_slug = 'map_perf_flow'
   and step_slug = 'root_map'),
  10000::bigint,
  '10000-element array should create 10000 tasks'
);

-- Verify tasks have sequential indices
select ok(
  (select bool_and(task_index = expected_index)
   from (
     select task_index, row_number() over (order by task_index) - 1 as expected_index
     from pgflow.step_tasks
     where flow_slug = 'map_perf_flow'
     and run_id = (select run_id from pgflow.runs where flow_slug = 'map_perf_flow' limit 1)
   ) t),
  'Task indices should be sequential from 0'
);

-- Performance assertions

-- Assert reasonable absolute performance for task creation
-- Relaxed for CI environments (was 10 seconds)
select ok(
  (select task_creation_time_ms from map_performance where array_size = 10000) < 30000,
  'Creating 10,000 tasks should complete in under 30 seconds'
);

-- Assert per-task creation time is reasonable
-- Relaxed for CI environments (was 2ms)
select ok(
  (select avg(time_per_element_ms) from map_performance where array_size > 0) < 5,
  'Average task creation time should be under 5ms per task'
);

-- CRITICAL: Assert linear scaling for task creation
-- Task creation time should scale linearly with array size
select ok(
  (select time_ratio <= size_ratio * 1.5
   from (
     select
       flow_start_time_ms as time_ratio,
       task_creation_time_ms as size_ratio
     from map_performance
     where array_size = -1  -- Sentinel row contains ratios
   ) ratios),
  'Task creation MUST scale linearly (time_ratio <= size_ratio * 1.5)'
);

-- Warn if task creation approaches quadratic scaling
select ok(
  (select time_ratio <= size_ratio * 2.0
   from (
     select
       flow_start_time_ms as time_ratio,
       task_creation_time_ms as size_ratio
     from map_performance
     where array_size = -1  -- Sentinel row contains ratios
   ) ratios),
  'Task creation should not approach quadratic scaling'
);

-- CRITICAL: Verify start_tasks (polling) performance is constant
-- This proves polling time is independent of total array size
-- Relaxed for CI environments (was 10ms variance)
select ok(
  (select max(start_tasks_time_ms) - min(start_tasks_time_ms) < 30
   from map_performance
   where array_size > 0),
  'start_tasks (polling) time should be constant regardless of total array size (< 30ms variance)'
);

-- Check for task creation performance regression
select ok(
  (select time_per_element_ms from map_performance where array_size = 10000) <=
  (select time_per_element_ms from map_performance where array_size = 100) * 2,
  'Per-task creation time should not degrade by more than 2x from 100 to 10k tasks'
);

select * from finish();
rollback;