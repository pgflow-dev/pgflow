begin;
select plan(1);
select pgflow_tests.reset_db();

-- SETUP: Create flow with root map step
select pgflow.create_flow('null_handling_flow');
select pgflow.add_step(
  flow_slug => 'null_handling_flow', 
  step_slug => 'root_map', 
  deps_slugs => '{}',
  step_type => 'map'
);

-- TEST: We explicitly check for NULL input and provide a clear error message
-- This is better than relying on jsonb_typeof(NULL) which would return NULL
-- and cause the comparison NULL != 'array' to be NULL (not true), missing validation
select throws_ok(
  $$ select pgflow.start_flow('null_handling_flow', NULL::jsonb) $$,
  'P0001',
  'Flow null_handling_flow has root map steps but input is NULL',
  'Should fail with our custom error message when input is NULL for flow with root map step'
);

-- Implementation note: 
-- We explicitly check for NULL before using jsonb_typeof to provide a clear error.
-- Without this check, jsonb_typeof(NULL) returns NULL, making NULL != 'array' evaluate
-- to NULL (not true), which would bypass validation entirely.

select finish();
rollback;