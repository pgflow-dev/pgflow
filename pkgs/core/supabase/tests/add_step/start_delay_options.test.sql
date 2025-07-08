begin;
select plan(7);
select pgflow_tests.reset_db();

-- SETUP: Create flow with steps
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'default_options');
select pgflow.add_step('test_flow', 'with_start_delay', start_delay => 300);
select pgflow.add_step('test_flow', 'with_zero_delay', start_delay => 0);

-- TEST: opt_start_delay is NULL by default
select is(
  (select opt_start_delay from pgflow.steps where step_slug = 'default_options'),
  NULL,
  'opt_start_delay is NULL by default'
);

-- TEST: opt_start_delay can be set
select is(
  (select opt_start_delay from pgflow.steps where step_slug = 'with_start_delay'),
  300,
  'opt_start_delay can be set to 300 seconds'
);

-- TEST: opt_start_delay can be set to 0
select is(
  (select opt_start_delay from pgflow.steps where step_slug = 'with_zero_delay'),
  0,
  'opt_start_delay can be set to 0 (no delay)'
);

-- SETUP: Add same step again to make sure it doesn't get updated
select pgflow.add_step('test_flow', 'added_twice', start_delay => 600);
select pgflow.add_step('test_flow', 'added_twice', start_delay => 1200);

-- TEST: Should not update opt_start_delay on subsequent calls
select is(
  (select opt_start_delay from pgflow.steps where step_slug = 'added_twice'),
  600,
  'Should not update opt_start_delay on subsequent add_step calls'
);

-- SETUP: Add step with default value again to make sure it doesn't get updated
select pgflow.add_step('test_flow', 'default_options', start_delay => 900);

-- TEST: Should not update opt_start_delay for step with default value
select is(
  (select opt_start_delay from pgflow.steps where step_slug = 'default_options'),
  NULL,
  'Should not update opt_start_delay for step that was created with default value'
);

-- TEST: opt_start_delay constraint should reject negative values
select throws_ok(
  $$ select pgflow.add_step('test_flow', 'negative_delay', start_delay => -10) $$,
  'new row for relation "steps" violates check constraint "opt_start_delay_is_nonnegative"',
  'opt_start_delay should not accept negative values'
);

-- TEST: All runtime options can be set together
select pgflow.add_step('test_flow', 'all_options', 
  max_attempts => 5, 
  base_delay => 10, 
  timeout => 120,
  start_delay => 3600
);

select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout, opt_start_delay 
     FROM pgflow.steps 
     WHERE step_slug = 'all_options' $$,
  $$ VALUES (5, 10, 120, 3600) $$,
  'All runtime options including opt_start_delay can be set together'
);

select * from finish();
rollback;