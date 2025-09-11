begin;
select plan(6);
select pgflow_tests.reset_db();

-- SETUP: Create flow with root map step
select pgflow.create_flow('invalid_type_flow');
select pgflow.add_step(
  flow_slug => 'invalid_type_flow', 
  step_slug => 'root_map', 
  deps_slugs => '{}',
  step_type => 'map'
);

-- TEST: String input should fail
select throws_ok(
  $$ select pgflow.start_flow('invalid_type_flow', '"not an array"'::jsonb) $$,
  'P0001',
  'Flow invalid_type_flow has root map steps but input is not an array (got string)',
  'Should fail when input is a string for flow with root map step'
);

-- TEST: Number input should fail
select throws_ok(
  $$ select pgflow.start_flow('invalid_type_flow', '42'::jsonb) $$,
  'P0001',
  'Flow invalid_type_flow has root map steps but input is not an array (got number)',
  'Should fail when input is a number for flow with root map step'
);

-- TEST: Boolean true input should fail
select throws_ok(
  $$ select pgflow.start_flow('invalid_type_flow', 'true'::jsonb) $$,
  'P0001',
  'Flow invalid_type_flow has root map steps but input is not an array (got boolean)',
  'Should fail when input is boolean true for flow with root map step'
);

-- TEST: Boolean false input should fail
select throws_ok(
  $$ select pgflow.start_flow('invalid_type_flow', 'false'::jsonb) $$,
  'P0001',
  'Flow invalid_type_flow has root map steps but input is not an array (got boolean)',
  'Should fail when input is boolean false for flow with root map step'
);

-- TEST: Object input should fail
select throws_ok(
  $$ select pgflow.start_flow('invalid_type_flow', '{"key": "value"}'::jsonb) $$,
  'P0001',
  'Flow invalid_type_flow has root map steps but input is not an array (got object)',
  'Should fail when input is an object for flow with root map step'
);

-- TEST: Complex nested object should fail
select throws_ok(
  $$ select pgflow.start_flow('invalid_type_flow', '{"users": [1, 2, 3], "count": 3}'::jsonb) $$,
  'P0001',
  'Flow invalid_type_flow has root map steps but input is not an array (got object)',
  'Should fail when input is complex object even if it contains arrays'
);

select finish();
rollback;