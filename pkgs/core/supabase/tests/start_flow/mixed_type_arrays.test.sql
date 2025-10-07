begin;
select plan(5);
select pgflow_tests.reset_db();

-- SETUP: Create flow with root map step
select pgflow.create_flow('mixed_types_flow');
select pgflow.add_step(
  flow_slug => 'mixed_types_flow', 
  step_slug => 'mixed_map', 
  deps_slugs => '{}',
  step_type => 'map'
);

-- TEST: Array with mixed types (number, string, boolean, null, object, array)
select pgflow.start_flow('mixed_types_flow', '[1, "string", true, null, {"key": "value"}, [1, 2, 3]]'::jsonb);

select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'mixed_map' limit 1),
  6,
  'Array with mixed types should have initial_tasks = 6 (one per element)'
);

-- TEST: Array with only nulls
select pgflow_tests.reset_db();
select pgflow.create_flow('null_array_flow');
select pgflow.add_step(
  flow_slug => 'null_array_flow', 
  step_slug => 'null_map', 
  deps_slugs => '{}',
  step_type => 'map'
);

select pgflow.start_flow('null_array_flow', '[null, null, null]'::jsonb);

select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'null_map' limit 1),
  3,
  'Array with only null values should have initial_tasks = 3'
);

-- TEST: Array with complex objects
select pgflow_tests.reset_db();
select pgflow.create_flow('complex_flow');
select pgflow.add_step(
  flow_slug => 'complex_flow', 
  step_slug => 'complex_map', 
  deps_slugs => '{}',
  step_type => 'map'
);

select pgflow.start_flow('complex_flow', 
  '[{"user": {"name": "Alice", "age": 30}}, {"user": {"name": "Bob", "age": 25}}]'::jsonb
);

select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'complex_map' limit 1),
  2,
  'Array with complex objects should count top-level elements'
);

-- TEST: Array with unicode and special characters
select pgflow_tests.reset_db();
select pgflow.create_flow('unicode_flow');
select pgflow.add_step(
  flow_slug => 'unicode_flow', 
  step_slug => 'unicode_map', 
  deps_slugs => '{}',
  step_type => 'map'
);

select pgflow.start_flow('unicode_flow', '["Hello 世界", "こんにちは", "🚀", "tab\there", "new\nline"]'::jsonb);

select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'unicode_map' limit 1),
  5,
  'Array with unicode and special characters should handle correctly'
);

-- TEST: Array with duplicate values
select pgflow_tests.reset_db();
select pgflow.create_flow('duplicate_flow');
select pgflow.add_step(
  flow_slug => 'duplicate_flow', 
  step_slug => 'duplicate_map', 
  deps_slugs => '{}',
  step_type => 'map'
);

select pgflow.start_flow('duplicate_flow', '[1, 1, 1, 2, 2, 3]'::jsonb);

select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'duplicate_map' limit 1),
  6,
  'Array with duplicate values should count all elements (not unique)'
);

select finish();
rollback;