begin;
select plan(3);
select pgflow_tests.reset_db();

-- Test: Non-array output to dependent map should fail the run

-- Create flow with single -> map dependency
select pgflow.create_flow('non_array_test');

select pgflow.add_step(
  flow_slug => 'non_array_test',
  step_slug => 'producer',
  step_type => 'single'
);

select pgflow.add_step(
  flow_slug => 'non_array_test',
  step_slug => 'map_consumer',
  deps_slugs => ARRAY['producer'],
  step_type => 'map'
);

select pgflow.start_flow(
  'non_array_test',
  '{}'::jsonb
);

-- Test: Map starts with NULL initial_tasks
select is(
  (select initial_tasks from pgflow.step_states
   where step_slug = 'map_consumer' limit 1),
  NULL::integer,
  'Dependent map should start with NULL initial_tasks'
);

-- Ensure worker exists for polling
select pgflow_tests.ensure_worker('non_array_test');

-- Start the producer task (simulating Edge Worker behavior)
WITH task AS (
  SELECT * FROM pgflow_tests.read_and_start('non_array_test') LIMIT 1
)
SELECT step_slug FROM task;

-- Test: complete_task should RAISE EXCEPTION for non-array output to map
select throws_ok(
  $$
  WITH task_info AS (
    SELECT run_id, step_slug, task_index
    FROM pgflow.step_tasks
    WHERE flow_slug = 'non_array_test'
      AND step_slug = 'producer'
    LIMIT 1
  )
  SELECT pgflow.complete_task(
    task_info.run_id,
    task_info.step_slug,
    task_info.task_index,
    '{"not": "an array"}'::jsonb
  ) FROM task_info
  $$,
  'P0001',  -- RAISE EXCEPTION error code
  'Map step map_consumer expects array input but dependency producer produced object (output: {"not": "an array"})',
  'complete_task should fail when non-array is passed to dependent map'
);

-- Test: Map initial_tasks should remain NULL after failed transaction
select is(
  (select initial_tasks from pgflow.step_states
   where step_slug = 'map_consumer' limit 1),
  NULL,
  'Map initial_tasks should remain NULL after failed non-array update'
);

select * from finish();
rollback;