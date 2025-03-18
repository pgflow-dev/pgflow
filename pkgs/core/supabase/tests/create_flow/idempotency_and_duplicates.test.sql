begin;
select plan(2);
select pgflow_tests.reset_db();

-- Setup initial flow
select pgflow.create_flow('test_flow');

-- SETUP: Create flow again to ensure it doesn't throw
select pgflow.create_flow('test_flow');

-- TEST: No duplicate flow should be created
select results_eq(
  $$ SELECT flow_slug FROM pgflow.flows $$,
  array['test_flow']::text [],
  'No duplicate flow should be created'
);

--TEST: Creating a flow with existing flow_slug should still return the flow
select results_eq(
  $$ SELECT flow_slug FROM pgflow.create_flow('test_flow') $$,
  $$ VALUES ('test_flow') $$,
  'Creating a flow with existing flow_slug should still return the flow'
);

select * from finish();
rollback;
