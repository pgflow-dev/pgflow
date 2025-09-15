begin;
select plan(7);
select pgflow_tests.reset_db();

-- Test: Measure cascade performance for different chain lengths
select diag('Testing cascade performance with increasing chain lengths');

-- Helper function to create a chain of N map steps
CREATE OR REPLACE FUNCTION create_map_chain(flow_name text, chain_length int)
RETURNS void AS $$
DECLARE
  i INT;
BEGIN
  PERFORM pgflow.create_flow(flow_name);

  -- Create root map
  PERFORM pgflow.add_step(
    flow_name,
    'map_0',
    step_type => 'map'
  );

  -- Create chain of dependent maps
  FOR i IN 1..(chain_length - 1) LOOP
    PERFORM pgflow.add_step(
      flow_name,
      'map_' || i,
      ARRAY['map_' || (i-1)],
      step_type => 'map'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Test different chain lengths and measure performance
CREATE TEMP TABLE cascade_performance (
  chain_length int,
  execution_time_ms numeric,
  time_per_step_ms numeric
);

-- Test 5-step cascade
DO $$
DECLARE
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_duration interval;
  v_ms numeric;
BEGIN
  PERFORM create_map_chain('cascade_5', 5);

  v_start_time := clock_timestamp();
  PERFORM pgflow.start_flow('cascade_5', '[]'::jsonb);
  v_end_time := clock_timestamp();

  v_duration := v_end_time - v_start_time;
  v_ms := EXTRACT(EPOCH FROM v_duration) * 1000;

  INSERT INTO cascade_performance VALUES (5, v_ms, v_ms / 5);

  RAISE NOTICE 'CASCADE 5 steps: % ms total, % ms per step',
    round(v_ms, 2), round(v_ms / 5, 2);
END $$;

-- Test 10-step cascade
DO $$
DECLARE
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_duration interval;
  v_ms numeric;
BEGIN
  PERFORM create_map_chain('cascade_10', 10);

  v_start_time := clock_timestamp();
  PERFORM pgflow.start_flow('cascade_10', '[]'::jsonb);
  v_end_time := clock_timestamp();

  v_duration := v_end_time - v_start_time;
  v_ms := EXTRACT(EPOCH FROM v_duration) * 1000;

  INSERT INTO cascade_performance VALUES (10, v_ms, v_ms / 10);

  RAISE NOTICE 'CASCADE 10 steps: % ms total, % ms per step',
    round(v_ms, 2), round(v_ms / 10, 2);
END $$;

-- Test 25-step cascade
DO $$
DECLARE
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_duration interval;
  v_ms numeric;
BEGIN
  PERFORM create_map_chain('cascade_25', 25);

  v_start_time := clock_timestamp();
  PERFORM pgflow.start_flow('cascade_25', '[]'::jsonb);
  v_end_time := clock_timestamp();

  v_duration := v_end_time - v_start_time;
  v_ms := EXTRACT(EPOCH FROM v_duration) * 1000;

  INSERT INTO cascade_performance VALUES (25, v_ms, v_ms / 25);

  RAISE NOTICE 'CASCADE 25 steps: % ms total, % ms per step',
    round(v_ms, 2), round(v_ms / 25, 2);
END $$;

-- Test 49-step cascade (just under the limit)
DO $$
DECLARE
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_duration interval;
  v_ms numeric;
BEGIN
  PERFORM create_map_chain('cascade_49', 49);

  v_start_time := clock_timestamp();
  PERFORM pgflow.start_flow('cascade_49', '[]'::jsonb);
  v_end_time := clock_timestamp();

  v_duration := v_end_time - v_start_time;
  v_ms := EXTRACT(EPOCH FROM v_duration) * 1000;

  INSERT INTO cascade_performance VALUES (49, v_ms, v_ms / 49);

  RAISE NOTICE 'CASCADE 49 steps: % ms total, % ms per step',
    round(v_ms, 2), round(v_ms / 49, 2);
END $$;

-- Display performance summary
DO $$
DECLARE
  perf_row RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '🚀 CASCADE PERFORMANCE SUMMARY';
  RAISE NOTICE '========================================';

  FOR perf_row IN
    SELECT * FROM cascade_performance ORDER BY chain_length
  LOOP
    RAISE NOTICE '  % steps: % ms (% ms/step)',
      LPAD(perf_row.chain_length::text, 2),
      LPAD(round(perf_row.execution_time_ms, 1)::text, 7),
      round(perf_row.time_per_step_ms, 2);
  END LOOP;

  -- Calculate scaling factor
  WITH scaling AS (
    SELECT
      MAX(execution_time_ms) / MIN(execution_time_ms) as time_ratio,
      MAX(chain_length)::numeric / MIN(chain_length) as length_ratio
    FROM cascade_performance
  )
  SELECT
    CASE
      WHEN time_ratio < length_ratio * 1.5 THEN 'LINEAR or better'
      WHEN time_ratio < length_ratio * length_ratio * 0.5 THEN 'SUB-QUADRATIC'
      ELSE 'QUADRATIC or worse'
    END as scaling_behavior
  INTO perf_row
  FROM scaling;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Scaling behavior: %', perf_row.scaling_behavior;
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
END $$;

-- Verify all cascades completed successfully
select is(
  (select count(*) from pgflow.runs where status = 'completed'),
  4::bigint,
  'All 4 cascade test runs should complete'
);

-- Verify 5-step cascade completed all steps
select is(
  (select count(*) from pgflow.step_states
   where flow_slug = 'cascade_5' and status = 'completed'),
  5::bigint,
  '5-step cascade should complete all 5 steps'
);

-- Verify 10-step cascade completed all steps
select is(
  (select count(*) from pgflow.step_states
   where flow_slug = 'cascade_10' and status = 'completed'),
  10::bigint,
  '10-step cascade should complete all 10 steps'
);

-- Verify 25-step cascade completed all steps
select is(
  (select count(*) from pgflow.step_states
   where flow_slug = 'cascade_25' and status = 'completed'),
  25::bigint,
  '25-step cascade should complete all 25 steps'
);

-- Verify 49-step cascade completed all steps
select is(
  (select count(*) from pgflow.step_states
   where flow_slug = 'cascade_49' and status = 'completed'),
  49::bigint,
  '49-step cascade should complete all 49 steps'
);

-- Performance assertions
select ok(
  (select MAX(execution_time_ms) from cascade_performance) < 5000,
  'Even 49-step cascade should complete in under 5 seconds'
);

select ok(
  (select AVG(time_per_step_ms) from cascade_performance) < 100,
  'Average time per step should be under 100ms'
);

select * from finish();
rollback;