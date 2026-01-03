-- ============================================================================
-- BENCHMARK: step_output_storage Optimization
-- ============================================================================
-- Run with: psql -f pkgs/core/scripts/benchmarks/step_output_storage.sql
--
-- This benchmark measures the performance improvements from storing step
-- outputs in step_states.output instead of aggregating from step_tasks.
--
-- Run on BOTH branches and compare:
--   git checkout main && psql -f ...
--   git checkout step_output_storage && psql -f ...
-- ============================================================================

\timing on
\set ON_ERROR_STOP on

-- Configurable size - increase for more dramatic differences
-- 500 = ~2-3 min runtime, 1000 = ~10+ min runtime
\set ARRAY_SIZE 500

BEGIN;

-- Config table (psql vars don't work in DO blocks)
CREATE TEMP TABLE bench_config AS SELECT :ARRAY_SIZE as array_size;

-- Results table
CREATE TEMP TABLE bench_results (
  test_name text,
  iteration int,
  duration_ms numeric
);

-- ============================================================================
-- SETUP
-- ============================================================================
\echo '=== Setting up benchmark data ==='

-- Clean slate
DELETE FROM pgflow.step_tasks;
DELETE FROM pgflow.step_states;
DELETE FROM pgflow.runs;
DELETE FROM pgflow.deps;
DELETE FROM pgflow.steps;
DELETE FROM pgflow.flows;
DO $$ BEGIN PERFORM pgmq.drop_queue(queue_name) FROM pgmq.list_queues(); END $$;

-- Create flow: map(100) -> single consumer
SELECT pgflow.create_flow('bench_map_single', 10, 60, 3);
SELECT pgflow.add_step('bench_map_single', 'producer', '{}', null, null, null, null, 'map');
SELECT pgflow.add_step('bench_map_single', 'consumer', array['producer'], null, null, null, null, 'single');

-- Create flow: map(100) -> map(100)
SELECT pgflow.create_flow('bench_map_map', 10, 60, 3);
SELECT pgflow.add_step('bench_map_map', 'producer', '{}', null, null, null, null, 'map');
SELECT pgflow.add_step('bench_map_map', 'consumer', array['producer'], null, null, null, null, 'map');

-- Ensure workers exist
INSERT INTO pgflow.workers (worker_id, queue_name, function_name, last_heartbeat_at)
VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, 'bench_map_single', 'test', now()),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'bench_map_map', 'test', now())
ON CONFLICT (worker_id) DO UPDATE SET last_heartbeat_at = now();

\echo '=== Setup complete ==='

-- ============================================================================
-- BENCHMARK 1: Complete N map tasks (measures output aggregation on complete)
-- ============================================================================
\echo ''
\echo '=== BENCHMARK 1: complete_task with output storage ==='
\echo 'Completing :ARRAY_SIZE map tasks - measures aggregation on final task'

-- Start flow with N-element array
SELECT pgflow.start_flow('bench_map_single', (SELECT jsonb_agg(n) FROM generate_series(1, :ARRAY_SIZE) n));

DO $$
DECLARE
  v_run_id uuid;
  v_msg record;
  v_task_index int;
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_ms numeric;
  v_array_size int;
  i int;
BEGIN
  SELECT array_size INTO v_array_size FROM bench_config;
  SELECT run_id INTO v_run_id FROM pgflow.runs WHERE flow_slug = 'bench_map_single' LIMIT 1;

  -- Complete first N-1 tasks (warm-up, not the critical path)
  FOR i IN 1..(v_array_size - 1) LOOP
    SELECT * INTO v_msg FROM pgmq.read('bench_map_single', 1, 1) LIMIT 1;

    PERFORM pgflow.start_tasks('bench_map_single', ARRAY[v_msg.msg_id], '11111111-1111-1111-1111-111111111111'::uuid);

    SELECT task_index INTO v_task_index
    FROM pgflow.step_tasks WHERE message_id = v_msg.msg_id;

    PERFORM pgflow.complete_task(v_run_id, 'producer', v_task_index,
      jsonb_build_object('idx', v_task_index, 'data', repeat('x', 50)));
  END LOOP;

  -- Time the FINAL complete_task (triggers aggregation in OLD code, stores in NEW code)
  SELECT * INTO v_msg FROM pgmq.read('bench_map_single', 1, 1) LIMIT 1;
  PERFORM pgflow.start_tasks('bench_map_single', ARRAY[v_msg.msg_id], '11111111-1111-1111-1111-111111111111'::uuid);
  SELECT task_index INTO v_task_index FROM pgflow.step_tasks WHERE message_id = v_msg.msg_id;

  v_start_time := clock_timestamp();

  PERFORM pgflow.complete_task(v_run_id, 'producer', v_task_index,
    jsonb_build_object('idx', v_task_index, 'data', repeat('x', 50)));

  v_end_time := clock_timestamp();
  v_ms := EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000;

  INSERT INTO bench_results VALUES ('complete_task_final', 1, v_ms);
  RAISE NOTICE 'complete_task (final of %, triggers aggregation): % ms', v_array_size, round(v_ms, 2);
END $$;

-- ============================================================================
-- BENCHMARK 2: start_tasks reading from completed map (N outputs)
-- ============================================================================
\echo ''
\echo '=== BENCHMARK 2: start_tasks input assembly ==='
\echo 'Starting consumer task that reads :ARRAY_SIZE-element dependency output'
\echo 'OLD: aggregates from step_tasks | NEW: reads from step_states.output'

DO $$
DECLARE
  v_msg record;
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_ms numeric;
  v_iterations int := 10;
  i int;
BEGIN
  -- Run multiple iterations
  FOR i IN 1..v_iterations LOOP
    SELECT * INTO v_msg FROM pgmq.read('bench_map_single', 0, 1) LIMIT 1;

    v_start_time := clock_timestamp();

    PERFORM pgflow.start_tasks('bench_map_single', ARRAY[v_msg.msg_id], '11111111-1111-1111-1111-111111111111'::uuid);

    v_end_time := clock_timestamp();
    v_ms := EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000;

    INSERT INTO bench_results VALUES ('start_tasks_read_N', i, v_ms);

    -- Reset: re-queue the message for next iteration
    UPDATE pgmq.q_bench_map_single SET vt = now() - interval '1 second' WHERE msg_id = v_msg.msg_id;
    UPDATE pgflow.step_tasks SET status = 'queued', started_at = NULL, attempts_count = 0
    WHERE message_id = v_msg.msg_id;
  END LOOP;
END $$;

SELECT 'start_tasks_read_N' as test,
       round(avg(duration_ms), 3) as avg_ms,
       round(min(duration_ms), 3) as min_ms,
       round(max(duration_ms), 3) as max_ms
FROM bench_results WHERE test_name = 'start_tasks_read_N';

-- ============================================================================
-- BENCHMARK 3: Map->Map chain (N tasks each reading N outputs)
-- ============================================================================
\echo ''
\echo '=== BENCHMARK 3: Map->Map batch start_tasks ==='
\echo 'Starting :ARRAY_SIZE consumer tasks, each reading :ARRAY_SIZE-element dependency'
\echo 'OLD: N tasks * aggregate(N) = O(N^2) | NEW: N tasks * read(1) = O(N)'

-- Start flow
SELECT pgflow.start_flow('bench_map_map', (SELECT jsonb_agg(n) FROM generate_series(1, :ARRAY_SIZE) n));

-- Complete all producer tasks
DO $$
DECLARE
  v_run_id uuid;
  v_msg record;
  v_task_index int;
  v_array_size int;
  i int;
BEGIN
  SELECT array_size INTO v_array_size FROM bench_config;
  SELECT run_id INTO v_run_id FROM pgflow.runs WHERE flow_slug = 'bench_map_map' LIMIT 1;

  FOR i IN 1..v_array_size LOOP
    SELECT * INTO v_msg FROM pgmq.read('bench_map_map', 1, 1) LIMIT 1;
    PERFORM pgflow.start_tasks('bench_map_map', ARRAY[v_msg.msg_id], '22222222-2222-2222-2222-222222222222'::uuid);
    SELECT task_index INTO v_task_index FROM pgflow.step_tasks WHERE message_id = v_msg.msg_id;
    PERFORM pgflow.complete_task(v_run_id, 'producer', v_task_index,
      jsonb_build_object('idx', v_task_index, 'value', i * 10));
  END LOOP;

  RAISE NOTICE 'Setup: Completed % producer tasks', v_array_size;
END $$;

-- Now benchmark starting ALL N consumer tasks at once
DO $$
DECLARE
  v_msg_ids bigint[];
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_ms numeric;
  v_iterations int := 3;
  v_array_size int;
  v_count int;
  i int;
BEGIN
  SELECT array_size INTO v_array_size FROM bench_config;

  FOR i IN 1..v_iterations LOOP
    -- Read all N messages
    SELECT array_agg(msg_id) INTO v_msg_ids
    FROM pgmq.read('bench_map_map', 0, v_array_size);

    v_count := array_length(v_msg_ids, 1);

    v_start_time := clock_timestamp();

    PERFORM pgflow.start_tasks('bench_map_map', v_msg_ids, '22222222-2222-2222-2222-222222222222'::uuid);

    v_end_time := clock_timestamp();
    v_ms := EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000;

    INSERT INTO bench_results VALUES ('start_tasks_batch_NxN', i, v_ms);
    RAISE NOTICE 'Iteration %: started % tasks in % ms (% ms/task)',
      i, v_count, round(v_ms, 2), round(v_ms / v_count, 4);

    -- Reset for next iteration
    UPDATE pgmq.q_bench_map_map SET vt = now() - interval '1 second';
    UPDATE pgflow.step_tasks SET status = 'queued', started_at = NULL, attempts_count = 0
    WHERE step_slug = 'consumer' AND flow_slug = 'bench_map_map';
  END LOOP;
END $$;

SELECT 'start_tasks_batch_NxN' as test,
       round(avg(duration_ms), 3) as avg_ms,
       round(min(duration_ms), 3) as min_ms,
       round(max(duration_ms), 3) as max_ms
FROM bench_results WHERE test_name = 'start_tasks_batch_NxN';

-- ============================================================================
-- SUMMARY
-- ============================================================================
\echo ''
\echo '============================================'
\echo 'BENCHMARK SUMMARY (ARRAY_SIZE = :ARRAY_SIZE)'
\echo '============================================'

SELECT
  test_name,
  count(*) as iterations,
  round(avg(duration_ms), 3) as avg_ms,
  round(min(duration_ms), 3) as min_ms,
  round(max(duration_ms), 3) as max_ms,
  round(stddev(duration_ms), 3) as stddev_ms
FROM bench_results
GROUP BY test_name
ORDER BY test_name;

\echo ''
\echo 'Key comparisons (N = :ARRAY_SIZE):'
\echo '  - complete_task_final: Time to complete last of N tasks (triggers output storage)'
\echo '  - start_tasks_read_N: Time to read N-element dependency (single task)'
\echo '  - start_tasks_batch_NxN: Time to start N tasks each reading N outputs'
\echo ''
\echo 'Expected improvements on step_output_storage branch:'
\echo '  - start_tasks_read_N: Faster (O(1) vs O(N) per dep)'
\echo '  - start_tasks_batch_NxN: Much faster (O(N) vs O(N^2))'
\echo '============================================'

ROLLBACK;
