begin;
select plan(11);
select pgflow_tests.reset_db();

-- Test: Measure start_tasks performance for input assembly with varying array sizes
select diag('Testing start_tasks input assembly performance with increasing array sizes');

-- Create flow with root map
select pgflow.create_flow('input_perf_flow');
select pgflow.add_step(
  flow_slug => 'input_perf_flow',
  step_slug => 'root_map',
  deps_slugs => '{}',
  step_type => 'map'
);

-- Ensure worker exists for testing
select pgflow_tests.ensure_worker('input_perf_flow');

-- Create temp table for performance metrics
create temp table input_assembly_performance (
  array_size int,
  batch_size int,
  iterations int,
  total_time_ms numeric,
  avg_time_per_batch_ms numeric,
  avg_time_per_task_ms numeric,
  min_time_ms numeric,
  max_time_ms numeric
);

-- Helper function to measure start_tasks performance with multiple iterations
create or replace function measure_start_tasks_perf(
  p_array_size int,
  p_batch_size int,
  p_iterations int default 10
) returns void as $$
DECLARE
  v_run_id uuid;
  v_msg_ids bigint[];
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_iteration int;
  v_total_ms numeric := 0;
  v_min_ms numeric := 999999;
  v_max_ms numeric := 0;
  v_current_ms numeric;
BEGIN
  -- Clean up previous run if exists
  DELETE FROM pgflow.step_tasks WHERE flow_slug = 'input_perf_flow';
  DELETE FROM pgflow.step_states WHERE flow_slug = 'input_perf_flow';
  DELETE FROM pgflow.runs WHERE flow_slug = 'input_perf_flow';

  -- Start flow with specified array size
  SELECT run_id INTO v_run_id FROM pgflow.start_flow(
    'input_perf_flow',
    (SELECT jsonb_agg(
      jsonb_build_object(
        'id', i,
        'data', repeat('x', 100),  -- Add some payload to make it realistic
        'nested', jsonb_build_object('value', i * 10)
      )
    ) FROM generate_series(1, p_array_size) i)
  );

  -- Get batch of message IDs to test with
  SELECT array_agg(message_id) INTO v_msg_ids FROM (
    SELECT message_id FROM pgflow.step_tasks
    WHERE run_id = v_run_id
    ORDER BY task_index
    LIMIT p_batch_size
  ) t;

  -- Run multiple iterations to get stable measurements
  FOR v_iteration IN 1..p_iterations LOOP
    v_start_time := clock_timestamp();
    PERFORM * FROM pgflow.start_tasks(
      'input_perf_flow',
      v_msg_ids,
      '11111111-1111-1111-1111-111111111111'::uuid
    );
    v_end_time := clock_timestamp();

    v_current_ms := EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000;
    v_total_ms := v_total_ms + v_current_ms;

    IF v_current_ms < v_min_ms THEN
      v_min_ms := v_current_ms;
    END IF;

    IF v_current_ms > v_max_ms THEN
      v_max_ms := v_current_ms;
    END IF;
  END LOOP;

  -- Record results
  INSERT INTO input_assembly_performance VALUES (
    p_array_size,
    p_batch_size,
    p_iterations,
    v_total_ms,
    v_total_ms / p_iterations,  -- avg per batch
    v_total_ms / p_iterations / p_batch_size,  -- avg per task
    v_min_ms,
    v_max_ms
  );

  RAISE NOTICE 'Array % / Batch %: avg %ms (min %ms, max %ms) for % tasks',
    p_array_size, p_batch_size,
    round((v_total_ms / p_iterations)::numeric, 2),
    round(v_min_ms::numeric, 2),
    round(v_max_ms::numeric, 2),
    p_batch_size;
END;
$$ language plpgsql;

-- Test 1: Single task polling across different array sizes
select diag('Testing single task polling (batch_size=1)');
select measure_start_tasks_perf(100, 1, 20);    -- More iterations for single task
select measure_start_tasks_perf(1000, 1, 20);
select measure_start_tasks_perf(5000, 1, 20);
select measure_start_tasks_perf(10000, 1, 20);

-- Test 2: Batch of 10 tasks (typical worker batch)
select diag('Testing batch polling (batch_size=10)');
select measure_start_tasks_perf(100, 10, 10);
select measure_start_tasks_perf(1000, 10, 10);
select measure_start_tasks_perf(5000, 10, 10);
select measure_start_tasks_perf(10000, 10, 10);

-- Test 3: Large batch of 50 tasks
select diag('Testing large batch polling (batch_size=50)');
select measure_start_tasks_perf(100, 50, 10);
select measure_start_tasks_perf(1000, 50, 10);
select measure_start_tasks_perf(5000, 50, 10);
select measure_start_tasks_perf(10000, 50, 10);

-- Display performance summary
do $$
DECLARE
  perf_row RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════════════════════╗';
  RAISE NOTICE '║  📊 START_TASKS PERFORMANCE (ms)   ║';
  RAISE NOTICE '╠════════════════════════════════════╣';
  RAISE NOTICE '║ Array │ Single │ Batch-10 │ Batch-50║';
  RAISE NOTICE '║ Size  │ Task   │ (per 10) │ (per 50)║';
  RAISE NOTICE '╟───────┼────────┼──────────┼─────────╢';

  -- Create summary table
  FOR perf_row IN
    SELECT
      p1.array_size,
      round(p1.avg_time_per_batch_ms, 1) as single_ms,
      round(p2.avg_time_per_batch_ms, 1) as batch10_ms,
      round(p3.avg_time_per_batch_ms, 1) as batch50_ms
    FROM input_assembly_performance p1
    JOIN input_assembly_performance p2 ON p1.array_size = p2.array_size AND p2.batch_size = 10
    JOIN input_assembly_performance p3 ON p1.array_size = p3.array_size AND p3.batch_size = 50
    WHERE p1.batch_size = 1
    ORDER BY p1.array_size
  LOOP
    RAISE NOTICE '║% │ % │ % │ %║',
      LPAD(perf_row.array_size::text, 6),
      LPAD(perf_row.single_ms::text, 6),
      LPAD(perf_row.batch10_ms::text, 8),
      LPAD(perf_row.batch50_ms::text, 8);
  END LOOP;

  RAISE NOTICE '╚═══════╧════════╧══════════╧═════════╝';

  -- Per-task efficiency summary
  RAISE NOTICE '';
  RAISE NOTICE '⚡ PER-TASK TIME (ms):';
  FOR perf_row IN
    SELECT
      p1.array_size,
      round(p1.avg_time_per_task_ms, 2) as single_per,
      round(p2.avg_time_per_task_ms, 2) as batch10_per,
      round(p3.avg_time_per_task_ms, 2) as batch50_per
    FROM input_assembly_performance p1
    JOIN input_assembly_performance p2 ON p1.array_size = p2.array_size AND p2.batch_size = 10
    JOIN input_assembly_performance p3 ON p1.array_size = p3.array_size AND p3.batch_size = 50
    WHERE p1.batch_size = 1
    ORDER BY p1.array_size
  LOOP
    RAISE NOTICE '  % │ % │ % │ %',
      LPAD(perf_row.array_size::text, 5),
      LPAD(perf_row.single_per::text, 6),
      LPAD(perf_row.batch10_per::text, 6),
      LPAD(perf_row.batch50_per::text, 6);
  END LOOP;

  -- Analyze scaling
  RAISE NOTICE '';
  RAISE NOTICE '🔍 ANALYSIS (based on realistic batch-10 workload):';
  RAISE NOTICE '════════════════════════════════════';

  -- Check scaling for realistic batch size (10)
  WITH scaling AS (
    SELECT
      MAX(avg_time_per_batch_ms) / MIN(avg_time_per_batch_ms) as time_ratio,
      MIN(avg_time_per_batch_ms) as min_ms,
      MAX(avg_time_per_batch_ms) as max_ms
    FROM input_assembly_performance
    WHERE batch_size = 10  -- Realistic worker batch size
  )
  SELECT time_ratio, min_ms, max_ms
  INTO perf_row
  FROM scaling;

  RAISE NOTICE '  📈 Batch-10 scaling (100→10K): %x (%ms→%ms)',
    round(perf_row.time_ratio::numeric, 1),
    round(perf_row.min_ms::numeric, 1),
    round(perf_row.max_ms::numeric, 1);

  -- Batch efficiency
  WITH efficiency AS (
    SELECT
      AVG(CASE WHEN batch_size = 10 THEN avg_time_per_task_ms END) as b10,
      AVG(CASE WHEN batch_size = 50 THEN avg_time_per_task_ms END) as b50,
      AVG(CASE WHEN batch_size = 1 THEN avg_time_per_task_ms END) as b1
    FROM input_assembly_performance
  )
  SELECT b1/b10 as e10, b1/b50 as e50
  INTO perf_row
  FROM efficiency;

  RAISE NOTICE '  🚀 Batch efficiency: %x (B10), %x (B50)',
    round(perf_row.e10::numeric, 0),
    round(perf_row.e50::numeric, 0);

  -- Verdict based on realistic batch size
  WITH verdict AS (
    SELECT
      MAX(avg_time_per_batch_ms) / MIN(avg_time_per_batch_ms) as ratio
    FROM input_assembly_performance
    WHERE batch_size = 10  -- Base verdict on realistic batch size
  )
  SELECT
    CASE
      WHEN ratio < 2.0 THEN '✅ EXCELLENT - Workers can poll efficiently at any array size'
      WHEN ratio < 5.0 THEN '👍 GOOD - Minor slowdown but still production-ready'
      ELSE '⚠️ WARNING - May impact throughput with very large arrays'
    END as result
  INTO perf_row
  FROM verdict;

  RAISE NOTICE '  📊 Verdict: %', perf_row.result;

  RAISE NOTICE '════════════════════════════════════';
END $$;

-- ASSERTIONS

-- Single task performance should be relatively constant regardless of array size
-- Relaxed for CI environments (was 10ms variance)
select ok(
  (
    select max(avg_time_per_batch_ms) - min(avg_time_per_batch_ms) < 30
    from input_assembly_performance
    where batch_size = 1
  ),
  'Single task polling time should be relatively constant (< 30ms variance) regardless of array size'
);

-- Batch polling should have good per-task efficiency
-- Relaxed for CI environments (was 1ms)
select ok(
  (
    select avg(avg_time_per_task_ms) < 3.0
    from input_assembly_performance
    where batch_size = 10
  ),
  'Batch-10 should average < 3ms per task'
);

-- Relaxed for CI environments (was 0.5ms)
select ok(
  (
    select avg(avg_time_per_task_ms) < 1.5
    from input_assembly_performance
    where batch_size = 50
  ),
  'Batch-50 should average < 1.5ms per task'
);

-- Large arrays shouldn't significantly degrade performance
-- Relaxed for CI environments (was 10ms)
select ok(
  (
    select avg_time_per_batch_ms from input_assembly_performance
    where array_size = 10000 and batch_size = 1
  ) < 30,
  'Single task from 10k array should take < 30ms'
);

-- Relaxed for CI environments (was 20ms)
select ok(
  (
    select avg_time_per_batch_ms from input_assembly_performance
    where array_size = 10000 and batch_size = 10
  ) < 60,
  '10 tasks from 10k array should take < 60ms'
);

-- CRITICAL: Performance should NOT degrade with array size for realistic batch
-- This proves that jsonb_array_element scales well in practice
with degradation as (
  select
    (
      select avg_time_per_batch_ms from input_assembly_performance
      where array_size = 10000 and batch_size = 10
    ) /
    (
      select avg_time_per_batch_ms from input_assembly_performance
      where array_size = 100 and batch_size = 10
    ) as ratio
)

select ok(
  (select ratio < 5.0 from degradation),
  'Batch-10 polling should NOT degrade > 5x from 100 to 10k elements (realistic worker scenario)'
);

-- Batch efficiency test
with batch_speedup as (
  select
    (
      select avg_time_per_task_ms from input_assembly_performance
      where array_size = 1000 and batch_size = 1
    ) /
    (
      select avg_time_per_task_ms from input_assembly_performance
      where array_size = 1000 and batch_size = 10
    ) as speedup_10
)

select ok(
  (select speedup_10 > 2.0 from batch_speedup),
  'Batch-10 should be > 2x more efficient per task than single polling'
);

-- Absolute performance bounds
-- Relaxed for CI environments (was 10ms)
select ok(
  (
    select max(avg_time_per_batch_ms) from input_assembly_performance
    where batch_size = 1
  ) < 30,
  'All single task polls should complete in < 30ms'
);

-- Relaxed for CI environments (was 30ms)
select ok(
  (
    select max(avg_time_per_batch_ms) from input_assembly_performance
    where batch_size = 10
  ) < 90,
  'All 10-task batches should complete in < 90ms'
);

-- Relaxed for CI environments (was 100ms)
select ok(
  (
    select max(avg_time_per_batch_ms) from input_assembly_performance
    where batch_size = 50
  ) < 300,
  'All 50-task batches should complete in < 300ms'
);

-- Consistency check - max should not be too far from average
select ok(
  (
    select bool_and(max_time_ms < avg_time_per_batch_ms * 10)
    from input_assembly_performance
  ),
  'Max times should be < 10x average (reasonable variance allowed)'
);


-- Clean up function
drop function measure_start_tasks_perf(int, int, int);

select * from finish();
rollback;
