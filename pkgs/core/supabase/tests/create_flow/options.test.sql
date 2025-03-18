begin;
select plan(3);
select pgflow_tests.reset_db();

-- SETUP: flow with all default values
select pgflow.create_flow('test_flow');

--TEST: Should create flow with default retry_limit and retry_delay
select results_eq(
  $$ SELECT retry_limit, retry_delay FROM pgflow.create_flow('test_flow') $$,
  $$ VALUES (3, 5) $$,
  'Should create flow with default retry_limit and retry_delay'
);

-- SETUP: flow with overriden retry_limit
select pgflow.create_flow('test_flow_2', retry_limit => 10);

--TEST: Should allow overriding retry_limit
select results_eq(
  $$ SELECT retry_limit, retry_delay FROM pgflow.create_flow('test_flow_2') $$,
  $$ VALUES (10, 5) $$,
  'Should allow overriding retry_limit'
);

-- SETUP: flow with overriden retry_delay
select pgflow.create_flow('test_flow_3', retry_delay => 10);

--TEST: Should allow overriding retry_delay
select results_eq(
  $$ SELECT retry_limit, retry_delay FROM pgflow.create_flow('test_flow_3') $$,
  $$ VALUES (3, 10) $$,
  'Should allow overriding retry_delay'
);

select * from finish();
rollback;
