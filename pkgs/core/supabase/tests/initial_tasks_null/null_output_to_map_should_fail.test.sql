begin;
select plan(7);
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

-- Test: complete_task should handle NULL output gracefully (no exception)
select lives_ok(
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
  'complete_task should handle NULL output gracefully without throwing exception'
);

-- Test: Producer task should be marked as failed
select is(
  (select status from pgflow.step_tasks
   where flow_slug = 'null_output_test' and step_slug = 'producer'),
  'failed'::text,
  'Producer task should be marked as failed'
);

-- Test: Producer task should have appropriate error message
select ok(
  (select error_message ILIKE '%TYPE_VIOLATION%' from pgflow.step_tasks
   where flow_slug = 'null_output_test' and step_slug = 'producer'),
  'Producer task should have type constraint error message'
);

-- Test: Producer task should store NULL output
select is(
  (select output from pgflow.step_tasks
   where flow_slug = 'null_output_test' and step_slug = 'producer'),
  NULL::jsonb,
  'Producer task should store the NULL output that caused the type violation'
);

-- Test: Run should be marked as failed
select is(
  (select status from pgflow.runs
   where flow_slug = 'null_output_test' limit 1),
  'failed'::text,
  'Run should be marked as failed after type constraint violation'
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