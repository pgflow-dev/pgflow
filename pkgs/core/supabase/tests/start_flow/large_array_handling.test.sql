begin;

-- Create test functions that return SETOF TEXT
CREATE OR REPLACE FUNCTION pg_temp.test_large_array_1000_elements()
RETURNS SETOF TEXT 
LANGUAGE plpgsql AS $$
DECLARE
  v_start_time timestamp;
  v_end_time timestamp;
  v_duration_ms numeric;
  v_run_id uuid;
BEGIN
  -- Setup
  PERFORM pgflow_tests.reset_db();
  PERFORM pgflow.create_flow('large_array_flow');
  PERFORM pgflow.add_step(
    flow_slug => 'large_array_flow', 
    step_slug => 'large_map', 
    deps_slugs => '{}',
    step_type => 'map'
  );
  
  -- Test performance with 1000 elements
  v_start_time := clock_timestamp();
  SELECT run_id INTO v_run_id FROM pgflow.start_flow('large_array_flow', (select jsonb_agg(i) from generate_series(1, 1000) i));
  v_end_time := clock_timestamp();
  v_duration_ms := extract(epoch from (v_end_time - v_start_time)) * 1000;
  
  -- Output performance metrics
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '🚀 PERFORMANCE: 1000 elements spawned in % ms', round(v_duration_ms, 2);
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- Return test assertions
  RETURN NEXT ok(
    v_duration_ms < 150,
    format('Starting flow with 1000 elements should complete within 150ms (took %s ms)', round(v_duration_ms, 2))
  );
  
  RETURN NEXT is(
    (select initial_tasks from pgflow.step_states where run_id = v_run_id and step_slug = 'large_map'),
    1000,
    'Root map step should have initial_tasks = 1000 for array with 1000 elements'
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.test_large_array_10000_elements()
RETURNS SETOF TEXT 
LANGUAGE plpgsql AS $$
DECLARE
  v_start_time timestamp;
  v_end_time timestamp;
  v_duration_ms numeric;
  v_run_id uuid;
BEGIN
  -- Setup
  PERFORM pgflow_tests.reset_db();
  PERFORM pgflow.create_flow('xlarge_array_flow');
  PERFORM pgflow.add_step(
    flow_slug => 'xlarge_array_flow', 
    step_slug => 'xlarge_map', 
    deps_slugs => '{}',
    step_type => 'map'
  );
  
  -- Test performance with 10000 elements
  v_start_time := clock_timestamp();
  SELECT run_id INTO v_run_id FROM pgflow.start_flow('xlarge_array_flow', (select jsonb_agg(i) from generate_series(1, 10000) i));
  v_end_time := clock_timestamp();
  v_duration_ms := extract(epoch from (v_end_time - v_start_time)) * 1000;
  
  -- Output performance metrics
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '🚀 PERFORMANCE: 10000 elements spawned in % ms', round(v_duration_ms, 2);
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  
  -- Return test assertions
  RETURN NEXT ok(
    v_duration_ms < 800,
    format('Starting flow with 10000 elements should complete within 800ms (took %s ms)', round(v_duration_ms, 2))
  );
  
  RETURN NEXT is(
    (select initial_tasks from pgflow.step_states where run_id = v_run_id and step_slug = 'xlarge_map'),
    10000,
    'Root map step should have initial_tasks = 10000 for array with 10000 elements'
  );
END;
$$;

-- Run the tests
select plan(4);

SELECT * FROM pg_temp.test_large_array_1000_elements();
SELECT * FROM pg_temp.test_large_array_10000_elements();

select finish();
rollback;