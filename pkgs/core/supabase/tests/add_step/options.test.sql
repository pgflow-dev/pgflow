begin;
select plan(6);
select pgflow_tests.reset_db();

-- SETUP: Create flow with steps
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'default_options');
select pgflow.add_step('test_flow', 'overriden_max_attempts', max_attempts => 20);
select pgflow.add_step('test_flow', 'overriden_base_delay', base_delay => 30);
select pgflow.add_step('test_flow', 'overriden_timeout', timeout => 30);

-- TEST: opt_max_attempts, opt_base_delay and opt_timeout are NULL by default
select results_eq(
  $$ SELECT opt_max_attempts is null, opt_base_delay is null, opt_timeout is null FROM pgflow.steps WHERE step_slug = 'default_options' $$,
  $$ VALUES (true, true, true) $$,
  'opt_max_attempts, opt_base_delay and opt_timeout are NULL by default'
);

-- TEST: opt_max_attempts can be set
select is(
  (select opt_max_attempts from pgflow.steps where step_slug = 'overriden_max_attempts'),
  20,
  'opt_max_attempts can be set'
);

-- TEST: opt_base_delay can be set
select is(
  (select opt_base_delay from pgflow.steps where step_slug = 'overriden_base_delay'),
  30,
  'opt_base_delay can be set'
);

-- TEST: opt_timeout can be set
select is(
  (select opt_timeout from pgflow.steps where step_slug = 'overriden_timeout'),
  30,
  'opt_timeout can be set'
);

-- SETUP: Add same step again to make sure it doesnt get updated
select pgflow.add_step('test_flow', 'added_twice', max_attempts => 10, base_delay => 15, timeout => 90);
select pgflow.add_step('test_flow', 'added_twice', max_attempts => 20, base_delay => 30, timeout => 30);

--TEST: Should not update opt_max_attempts, opt_base_delay and opt_timeout
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout FROM pgflow.steps WHERE step_slug = 'added_twice' $$,
  $$ VALUES (10, 15, 90) $$,
  'Should not update opt_max_attempts, opt_base_delay and opt_timeout'
);

-- SETUP: Add step defined with default values again to make sure it doesnt get updated
select pgflow.add_step('test_flow', 'default_options', max_attempts => 0, base_delay => 15, timeout => 90);

-- TEST: Should not update opt_max_attempts, opt_base_delay and opt_timeout
select results_eq(
  $$ SELECT opt_max_attempts is null, opt_base_delay is null, opt_timeout is null FROM pgflow.steps WHERE step_slug = 'default_options' $$,
  $$ VALUES (true, true, true) $$,
  'Should not update opt_max_attempts, opt_base_delay and opt_timeout for step with default values'
);

select * from finish();
rollback;
