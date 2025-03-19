begin;
select plan(5);
select pgflow_tests.reset_db();

-- SETUP: flow with all default values
select pgflow.create_flow('test_flow');

--TEST: Should create flow with default max_attempts, base_delay and timeout
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout FROM pgflow.create_flow('test_flow') $$,
  $$ VALUES (3, 5, 60) $$,
  'Should create flow with default opt_max_attempts, opt_base_delay and opt_timeout'
);

-- SETUP: flow with overriden max_attempts
select pgflow.create_flow('test_flow_2', max_attempts => 10);

--TEST: Should allow overriding opt_max_attempts
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout FROM pgflow.create_flow('test_flow_2') $$,
  $$ VALUES (10, 5, 60) $$,
  'Should allow overriding opt_max_attempts'
);

-- SETUP: flow with overriden opt_base_delay
select pgflow.create_flow('test_flow_3', base_delay => 10);

--TEST: Should allow overriding base_delay
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout FROM pgflow.create_flow('test_flow_3') $$,
  $$ VALUES (3, 10, 60) $$,
  'Should allow overriding opt_base_delay'
);

-- SETUP: flow with overriden opt_timeout
select pgflow.create_flow('test_flow_5', timeout => 7200);

--TEST: Should allow overriding timeout
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout FROM pgflow.create_flow('test_flow_5') $$,
  $$ VALUES (3, 5, 7200) $$,
  'Should allow overriding opt_timeout'
);

-- SETUP: create same flow again to make sure it doesnt get updated
select pgflow.create_flow('test_flow_4', max_attempts => 10, base_delay => 15, timeout => 30);
select pgflow.create_flow('test_flow_4', max_attempts => 20, base_delay => 30, timeout => 60);

--TEST: Should not update opt_max_attempts, opt_base_delay and opt_timeout
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout FROM pgflow.create_flow('test_flow_4') $$,
  $$ VALUES (10, 15, 30) $$,
  'Should not update opt_max_attempts, opt_base_delay and opt_timeout'
);

select * from finish();
rollback;
