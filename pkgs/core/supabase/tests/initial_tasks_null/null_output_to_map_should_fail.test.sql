begin;
select plan(3);
select pgflow_tests.reset_db();

-- Test: NULL output to dependent map should fail

-- Create flow with single -> map dependency
select pgflow.create_flow('null_output_test');

select pgflow.add_step(
  flow_slug => 'null_output_test',
  step_slug => 'producer',
  step_type => 'single'
);

select pgflow.add_step(
  flow_slug => 'null_output_test',
  step_slug => 'map_consumer',
  deps_slugs => ARRAY['producer'],
  step_type => 'map'
);

select pgflow.start_flow(
  'null_output_test',
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
select pgflow_tests.ensure_worker('null_output_test');

-- Start the producer task (simulating Edge Worker behavior)
WITH task AS (
  SELECT * FROM pgflow_tests.read_and_start('null_output_test') LIMIT 1
)
SELECT step_slug FROM task;

-- Test: complete_task should RAISE EXCEPTION for NULL output to map
select throws_ilike(
  $$
  WITH task_info AS (
    SELECT run_id, step_slug, task_index
    FROM pgflow.step_tasks
    WHERE flow_slug = 'null_output_test'
      AND step_slug = 'producer'
    LIMIT 1
  )
  SELECT pgflow.complete_task(
    task_info.run_id,
    task_info.step_slug,
    task_info.task_index,
    NULL::jsonb  -- Passing literal NULL!
  ) FROM task_info
  $$,
  '%Map step map_consumer expects array input but dependency producer produced null%',
  'complete_task should fail when NULL is passed to dependent map'
);

-- Test: Map initial_tasks should remain NULL after failed transaction
select is(
  (select initial_tasks from pgflow.step_states
   where step_slug = 'map_consumer' limit 1),
  NULL,
  'Map initial_tasks should remain NULL after failed NULL output'
);

select * from finish();
rollback;