begin;
select plan(5);
select pgflow_tests.reset_db();

-- SETUP: Create flow with steps
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'default_options');
select pgflow.add_step('test_flow', 'overriden_retry_limit', retry_limit => 20);
select pgflow.add_step('test_flow', 'overriden_retry_delay', retry_delay => 30);

-- TEST: retry_limit and retry_delay are NULL by default
select results_eq(
  $$ SELECT retry_limit is null, retry_delay is null FROM pgflow.steps WHERE step_slug = 'default_options' $$,
  $$ VALUES (true, true) $$,
  'retry_limit and retry_delay are NULL by default'
);

-- TEST: retry_limit can be set
select is(
  (select retry_limit from pgflow.steps where step_slug = 'overriden_retry_limit'),
  20,
  'retry_limit can be set'
);

-- TEST: retry_delay can be set
select is(
  (select retry_delay from pgflow.steps where step_slug = 'overriden_retry_delay'),
  30,
  'retry_delay can be set'
);

-- SETUP: Add same step again to make sure it doesnt get updated
select pgflow.add_step('test_flow', 'added_twice', retry_limit => 10, retry_delay => 15);
select pgflow.add_step('test_flow', 'added_twice', retry_limit => 20, retry_delay => 30);

--TEST: Should not update retry_limit and retry_delay
select results_eq(
  $$ SELECT retry_limit, retry_delay FROM pgflow.steps WHERE step_slug = 'added_twice' $$,
  $$ VALUES (10, 15) $$,
  'Should not update retry_limit and retry_delay'
);

-- SETUP: Add step deifined with default values again to make sure it doesnt get updated
SELECT pgflow.add_step('test_flow', 'default_options', retry_limit => 0, retry_delay => 15);

-- TEST: Should not update retry_limit and retry_delay
select results_eq(
  $$ SELECT retry_limit is null, retry_delay is null FROM pgflow.steps WHERE step_slug = 'default_options' $$,
  $$ VALUES (true, true) $$,
  'Should not update retry_limit and retry_delay for step with default values'
);


select * from finish();
rollback;
