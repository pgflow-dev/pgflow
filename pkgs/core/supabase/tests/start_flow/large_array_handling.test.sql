begin;
select plan(4);
select pgflow_tests.reset_db();

-- SETUP: Create flow with root map step
select pgflow.create_flow('large_array_flow');
select pgflow.add_step(
  flow_slug => 'large_array_flow', 
  step_slug => 'large_map', 
  deps_slugs => '{}',
  step_type => 'map'
);

-- Generate and start flow with 1000 elements, then test performance
WITH perf_test AS (
  SELECT 
    clock_timestamp() as start_time,
    pgflow.start_flow('large_array_flow', (select jsonb_agg(i) from generate_series(1, 1000) i)) as result,
    clock_timestamp() as end_time
),
timing AS (
  SELECT 
    extract(epoch from (end_time - start_time)) * 1000 as duration_ms
  FROM perf_test
)
SELECT ok(
  duration_ms < 100,
  format('Starting flow with 1000 elements should complete within 100ms (took %s ms)', round(duration_ms, 2))
)
FROM timing;

-- TEST: Verify initial_tasks is set correctly for 1000 elements
select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'large_map' limit 1),
  1000,
  'Root map step should have initial_tasks = 1000 for array with 1000 elements'
);

-- TEST: Extra large array with 10000 elements
select pgflow_tests.reset_db();
select pgflow.create_flow('xlarge_array_flow');
select pgflow.add_step(
  flow_slug => 'xlarge_array_flow', 
  step_slug => 'xlarge_map', 
  deps_slugs => '{}',
  step_type => 'map'
);

-- Generate and start flow with 10000 elements, then test performance
WITH perf_test AS (
  SELECT 
    clock_timestamp() as start_time,
    pgflow.start_flow('xlarge_array_flow', (select jsonb_agg(i) from generate_series(1, 10000) i)) as result,
    clock_timestamp() as end_time
),
timing AS (
  SELECT 
    extract(epoch from (end_time - start_time)) * 1000 as duration_ms
  FROM perf_test
)
SELECT ok(
  duration_ms < 500,
  format('Starting flow with 10000 elements should complete within 500ms (took %s ms)', round(duration_ms, 2))
)
FROM timing;

-- TEST: Verify initial_tasks is set correctly for 10000 elements
select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'xlarge_map' limit 1),
  10000,
  'Root map step should have initial_tasks = 10000 for array with 10000 elements'
);

select finish();
rollback;