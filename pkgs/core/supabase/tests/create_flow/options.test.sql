begin;
select plan(4);
select pgflow_tests.reset_db();

-- SETUP: flow with all default values
select pgflow.create_flow('test_flow');

--TEST: Should create flow with default max_attempts and base_delay
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay FROM pgflow.create_flow('test_flow') $$,
  $$ VALUES (3, 5) $$,
  'Should create flow with default opt_max_attempts and opt_base_delay'
);

-- SETUP: flow with overriden max_attempts
select pgflow.create_flow('test_flow_2', max_attempts => 10);

--TEST: Should allow overriding opt_max_attempts
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay FROM pgflow.create_flow('test_flow_2') $$,
  $$ VALUES (10, 5) $$,
  'Should allow overriding opt_max_attempts'
);

-- SETUP: flow with overriden opt_base_delay
select pgflow.create_flow('test_flow_3', base_delay => 10);

--TEST: Should allow overriding base_delay
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay FROM pgflow.create_flow('test_flow_3') $$,
  $$ VALUES (3, 10) $$,
  'Should allow overriding opt_base_delay'
);

-- SETUP: create same flow again to make sure it doesnt get updated
select pgflow.create_flow('test_flow_4', max_attempts => 10, base_delay => 15);
select pgflow.create_flow('test_flow_4', max_attempts => 20, base_delay => 30);

--TEST: Should not update opt_max_attempts and opt_base_delay
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay FROM pgflow.create_flow('test_flow_4') $$,
  $$ VALUES (10, 15) $$,
  'Should not update opt_max_attempts and opt_base_delay'
);

select * from finish();
rollback;
