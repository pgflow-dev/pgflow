begin;
select plan(3);
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

select * from finish();
rollback;
