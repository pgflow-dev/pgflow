begin;
select plan(5);
select pgflow_tests.reset_db();

-- SETUP: Create flow with steps
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'default_options');
select pgflow.add_step('test_flow', 'overriden_max_attempts', max_attempts => 20);
select pgflow.add_step('test_flow', 'overriden_base_delay', base_delay => 30);

-- TEST: opt_max_attempts and opt_base_delay are NULL by default
select results_eq(
  $$ SELECT opt_max_attempts is null, opt_base_delay is null FROM pgflow.steps WHERE step_slug = 'default_options' $$,
  $$ VALUES (true, true) $$,
  'opt_max_attempts and opt_base_delay are NULL by default'
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

-- SETUP: Add same step again to make sure it doesnt get updated
select pgflow.add_step('test_flow', 'added_twice', max_attempts => 10, base_delay => 15);
select pgflow.add_step('test_flow', 'added_twice', max_attempts => 20, base_delay => 30);

--TEST: Should not update opt_max_attempts and opt_base_delay
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay FROM pgflow.steps WHERE step_slug = 'added_twice' $$,
  $$ VALUES (10, 15) $$,
  'Should not update opt_max_attempts and opt_base_delay'
);

-- SETUP: Add step deifined with default values again to make sure it doesnt get updated
SELECT pgflow.add_step('test_flow', 'default_options', max_attempts => 0, base_delay => 15);

-- TEST: Should not update opt_max_attempts and opt_base_delay
select results_eq(
  $$ SELECT opt_max_attempts is null, opt_base_delay is null FROM pgflow.steps WHERE step_slug = 'default_options' $$,
  $$ VALUES (true, true) $$,
  'Should not update opt_max_attempts and opt_base_delay for step with default values'
);


select * from finish();
rollback;
