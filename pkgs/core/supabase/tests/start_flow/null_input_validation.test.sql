begin;
select plan(2);
select pgflow_tests.reset_db();

-- SETUP: Create flow with root map step
select pgflow.create_flow('null_test_flow');
select pgflow.add_step(
  flow_slug => 'null_test_flow', 
  step_slug => 'root_map', 
  deps_slugs => '{}',
  step_type => 'map'
);

-- TEST: Should fail when input is NULL for root map flow
-- Our implementation explicitly checks for NULL and provides a clear error message
select throws_ok(
  $$ select pgflow.start_flow('null_test_flow', NULL::jsonb) $$,
  'P0001',  -- raise_exception error code
  'Flow null_test_flow has root map steps but input is NULL',
  'Should fail when input is NULL with custom error for root map flow'
);

-- TEST: JSON null value should be treated as non-array and fail
select throws_ok(
  $$ select pgflow.start_flow('null_test_flow', 'null'::jsonb) $$,
  'P0001',
  'Flow null_test_flow has root map steps but input is not an array (got null)',
  'Should fail when input is JSON null for flow with root map step'
);

select finish();
rollback;