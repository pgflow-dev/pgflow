begin;
select plan(8);
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

-- Test: complete_task should handle type violation gracefully (no exception)
select lives_ok(
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
  'complete_task should handle type violation gracefully without throwing exception'
);

-- Test: Producer task should be marked as failed with error message
select is(
  (select status from pgflow.step_tasks
   where flow_slug = 'non_array_test' and step_slug = 'producer'),
  'failed'::text,
  'Producer task should be marked as failed'
);

-- Test: Producer task should have appropriate error message
select ok(
  (select error_message ILIKE '%TYPE_VIOLATION%' from pgflow.step_tasks
   where flow_slug = 'non_array_test' and step_slug = 'producer'),
  'Producer task should have type constraint error message'
);

-- Test: Producer task should store the invalid output despite failing
select is(
  (select output from pgflow.step_tasks
   where flow_slug = 'non_array_test' and step_slug = 'producer'),
  '{"not": "an array"}'::jsonb,
  'Producer task should store the output that caused the type violation'
);

-- Test: Run should be marked as failed
select is(
  (select status from pgflow.runs
   where flow_slug = 'non_array_test' limit 1),
  'failed'::text,
  'Run should be marked as failed after type constraint violation'
);

-- Test: Messages should be archived
select cmp_ok(
  (select count(*) from pgmq.a_non_array_test
   where message->>'step_slug' = 'producer'),
  '>',
  0::bigint,
  'Failed task messages should be archived'
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