begin;
select plan(3);
select pgflow_tests.reset_db();

-- SETUP: Create flow with multiple root map steps
select pgflow.create_flow('multi_map_flow');

-- Add first root map step
select pgflow.add_step(
  flow_slug => 'multi_map_flow', 
  step_slug => 'map_one', 
  deps_slugs => '{}',
  step_type => 'map'
);

-- Add second root map step
select pgflow.add_step(
  flow_slug => 'multi_map_flow', 
  step_slug => 'map_two', 
  deps_slugs => '{}',
  step_type => 'map'
);

-- Add third root map step
select pgflow.add_step(
  flow_slug => 'multi_map_flow', 
  step_slug => 'map_three', 
  deps_slugs => '{}',
  step_type => 'map'
);

-- TEST: Start flow with array input of 5 elements
select pgflow.start_flow('multi_map_flow', '[10, 20, 30, 40, 50]'::jsonb);

-- TEST: All root map steps should have initial_tasks = 5
select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'map_one' limit 1),
  5,
  'First root map step should have initial_tasks = 5'
);

select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'map_two' limit 1),
  5,
  'Second root map step should have initial_tasks = 5'
);

select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'map_three' limit 1),
  5,
  'Third root map step should have initial_tasks = 5'
);

select finish();
rollback;