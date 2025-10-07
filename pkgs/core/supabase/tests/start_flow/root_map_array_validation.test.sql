begin;
select plan(1);
select pgflow_tests.reset_db();

-- SETUP: Create flow with root map step
select pgflow.create_flow('test_flow');
select pgflow.add_step(
  flow_slug => 'test_flow', 
  step_slug => 'root_map', 
  deps_slugs => '{}',
  step_type => 'map'
);

-- TEST: Should fail when input is not an array for root map flow
select throws_ok(
  $$ select pgflow.start_flow('test_flow', '{"not": "array"}'::jsonb) $$,
  'P0001',
  'Flow test_flow has root map steps but input is not an array (got object)',
  'Should fail when input is not an array for flow with root map step'
);

select finish();
rollback;