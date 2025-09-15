begin;
select plan(4);
select pgflow_tests.reset_db();

-- SETUP: Create flow with root map step
select pgflow.create_flow('map_flow');
select pgflow.add_step(
  flow_slug => 'map_flow', 
  step_slug => 'root_map', 
  deps_slugs => '{}',
  step_type => 'map'
);
select pgflow.add_step(
  flow_slug => 'map_flow', 
  step_slug => 'single_step', 
  deps_slugs => array['root_map'],
  step_type => 'single'
);

-- TEST: Start flow with array input
select pgflow.start_flow('map_flow', '[1, 2, 3]'::jsonb);

-- TEST: Root map step should have initial_tasks set to array length
select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'root_map' limit 1),
  3,
  'Root map step should have initial_tasks = 3 for array with 3 elements'
);

-- TEST: Single step should have initial_tasks = 1
select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'single_step' limit 1),
  1,
  'Single step should have initial_tasks = 1'
);

-- TEST: Empty array should set initial_tasks to 0
select pgflow_tests.reset_db();
select pgflow.create_flow('empty_map_flow');
select pgflow.add_step(
  flow_slug => 'empty_map_flow', 
  step_slug => 'empty_root_map', 
  deps_slugs => '{}',
  step_type => 'map'
);

select pgflow.start_flow('empty_map_flow', '[]'::jsonb);

select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'empty_root_map' limit 1),
  0,
  'Root map step should have initial_tasks = 0 for empty array'
);

-- TEST: Large array should set correct initial_tasks
select pgflow_tests.reset_db();
select pgflow.create_flow('large_map_flow');
select pgflow.add_step(
  flow_slug => 'large_map_flow', 
  step_slug => 'large_root_map', 
  deps_slugs => '{}',
  step_type => 'map'
);

-- Create array with 100 elements
select pgflow.start_flow(
  'large_map_flow', 
  (select jsonb_agg(i) from generate_series(1, 100) i)
);

select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'large_root_map' limit 1),
  100,
  'Root map step should have initial_tasks = 100 for array with 100 elements'
);

select finish();
rollback;