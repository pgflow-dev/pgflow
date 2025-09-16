begin;
select plan(7);
select pgflow_tests.reset_db();

-- Test: Dependent map steps should start with NULL initial_tasks

-- Create a flow with single -> map dependency
select pgflow.create_flow('single_to_map_flow');

-- Add single root step
select pgflow.add_step(
  flow_slug => 'single_to_map_flow',
  step_slug => 'single_root',
  step_type => 'single'
);

-- Add dependent map step
select pgflow.add_step(
  flow_slug => 'single_to_map_flow',
  step_slug => 'dependent_map',
  deps_slugs => ARRAY['single_root'],
  step_type => 'map'
);

-- Start flow with some input
select pgflow.start_flow('single_to_map_flow', '{"data": "test"}'::jsonb);

-- TEST: Single root step should have initial_tasks = 1
select is(
  (select initial_tasks from pgflow.step_states
   where step_slug = 'single_root' limit 1),
  1,
  'Single root step should have initial_tasks = 1'
);

-- TEST: Dependent map step should have initial_tasks = NULL (unknown until dependency completes)
select is(
  (select initial_tasks from pgflow.step_states
   where step_slug = 'dependent_map' limit 1),
  NULL::integer,
  'Dependent map step should have initial_tasks = NULL until dependency completes'
);

-- Now test with a root map -> dependent map
select pgflow.create_flow('map_to_map_flow');

-- Add root map step
select pgflow.add_step(
  flow_slug => 'map_to_map_flow',
  step_slug => 'root_map',
  deps_slugs => '{}',
  step_type => 'map'
);

-- Add dependent map step
select pgflow.add_step(
  flow_slug => 'map_to_map_flow',
  step_slug => 'dependent_map2',
  deps_slugs => ARRAY['root_map'],
  step_type => 'map'
);

-- Start flow with array input for root map
select pgflow.start_flow('map_to_map_flow', '["item1", "item2", "item3"]'::jsonb);

-- TEST: Root map should have initial_tasks = array length
select is(
  (select initial_tasks from pgflow.step_states
   where step_slug = 'root_map' limit 1),
  3,
  'Root map step should have initial_tasks = 3 for array with 3 elements'
);

-- TEST: Dependent map step should have initial_tasks = NULL
select is(
  (select initial_tasks from pgflow.step_states
   where step_slug = 'dependent_map2' limit 1),
  NULL::integer,
  'Dependent map step should have initial_tasks = NULL even when depending on another map'
);

-- Test that dependent map steps cannot start with NULL initial_tasks
select pgflow.create_flow('test_no_start_with_null');

select pgflow.add_step(
  flow_slug => 'test_no_start_with_null',
  step_slug => 'single_step',
  step_type => 'single'
);

select pgflow.add_step(
  flow_slug => 'test_no_start_with_null',
  step_slug => 'map_step',
  deps_slugs => ARRAY['single_step'],
  step_type => 'map'
);

-- Start flow and store run_id
select pgflow.start_flow('test_no_start_with_null', '{}'::jsonb);

-- TEST: Verify map step is not started (should remain created with NULL initial_tasks)
select is(
  (select status from pgflow.step_states
   where step_slug = 'map_step'
     AND flow_slug = 'test_no_start_with_null'),
  'created',
  'Map step with NULL initial_tasks should remain in created status'
);

-- Complete the single step with an array output
-- This will update the dependent map's initial_tasks
WITH task AS (
  SELECT * FROM pgflow_tests.read_and_start('test_no_start_with_null') LIMIT 1
)
SELECT pgflow.complete_task(
  task.run_id,
  task.step_slug,
  0,
  '["a", "b"]'::jsonb  -- Array with 2 elements
)
FROM task;

-- TEST: Now the map step should be started
select is(
  (select status from pgflow.step_states
   where step_slug = 'map_step'
     AND flow_slug = 'test_no_start_with_null'),
  'started',
  'Map step should be started after initial_tasks is resolved'
);

-- TEST: Verify correct number of tasks were created
select is(
  (select count(*) from pgflow.step_tasks
   where step_slug = 'map_step'
     AND flow_slug = 'test_no_start_with_null'),
  2::bigint,
  'Map step should have 2 tasks created'
);

select * from finish();
rollback;