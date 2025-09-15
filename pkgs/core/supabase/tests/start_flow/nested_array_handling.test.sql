begin;
select plan(3);
select pgflow_tests.reset_db();

-- SETUP: Create flow with root map step
select pgflow.create_flow('nested_array_flow');
select pgflow.add_step(
  flow_slug => 'nested_array_flow', 
  step_slug => 'nested_map', 
  deps_slugs => '{}',
  step_type => 'map'
);

-- TEST: Nested arrays should count top-level elements only
select pgflow.start_flow('nested_array_flow', '[[1, 2, 3], [4, 5], [6]]'::jsonb);

select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'nested_map' limit 1),
  3,
  'Nested array [[1,2,3], [4,5], [6]] should have initial_tasks = 3 (top-level count)'
);

-- TEST: Deeply nested arrays
select pgflow_tests.reset_db();
select pgflow.create_flow('deep_nested_flow');
select pgflow.add_step(
  flow_slug => 'deep_nested_flow', 
  step_slug => 'deep_map', 
  deps_slugs => '{}',
  step_type => 'map'
);

select pgflow.start_flow('deep_nested_flow', '[[[1]], [[2], [3]], [[[4, 5]]]]'::jsonb);

select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'deep_map' limit 1),
  3,
  'Deeply nested array should count only top-level elements'
);

-- TEST: Mixed nesting levels
select pgflow_tests.reset_db();
select pgflow.create_flow('mixed_nested_flow');
select pgflow.add_step(
  flow_slug => 'mixed_nested_flow', 
  step_slug => 'mixed_map', 
  deps_slugs => '{}',
  step_type => 'map'
);

-- Array with mixed nesting: [1, [2, 3], [[4]], {"key": [5]}]
select pgflow.start_flow('mixed_nested_flow', '[1, [2, 3], [[4]], {"key": [5]}]'::jsonb);

select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'mixed_map' limit 1),
  4,
  'Array with mixed nesting levels should count top-level elements (4 items)'
);

select finish();
rollback;