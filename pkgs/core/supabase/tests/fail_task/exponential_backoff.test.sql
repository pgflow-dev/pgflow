begin;
select plan(4);
select pgflow_tests.reset_db();

-- create a test flow with two steps that have different base delays
select pgflow.create_flow('backoff_test');
select pgflow.add_step('backoff_test', 'first', max_attempts => 3, base_delay => 1);
select pgflow.add_step('backoff_test', 'last', max_attempts => 4, base_delay => 2);

-- start the flow with test data
select pgflow.start_flow('backoff_test', '{"test": true}'::jsonb);

-- simulate a task failure
select pgflow_tests.poll_and_fail('backoff_test', 1, 1);
select pgflow_tests.unhide_messages('backoff_test');
select pgflow_tests.poll_and_fail('backoff_test', 1, 1);

-- TEST: make sure we have proper attempts_count
select is(
  (select attempts_count::int from pgflow.step_tasks where step_slug = 'first'),
  2::int,
  'first task should have 2 attempts'
);

-- TEST: verify exponential backoff is set properly
select cmp_ok(
  (select vt_seconds from pgflow_tests.message_timing('first', 'backoff_test') limit 1),
  '>=',
  floor(1 * power(2, 2))::int,
  'first step task should have visible time set to at least the base delay'
);

-- SETUP: proceed to next step
select pgflow_tests.unhide_messages('backoff_test');
select pgflow_tests.poll_and_complete('backoff_test', 1, 1);
select pgflow_tests.unhide_messages('backoff_test');

-- SETUP: fail twice to verify appropriate backoff
select pgflow_tests.poll_and_fail('backoff_test', 1, 1);
select pgflow_tests.unhide_messages('backoff_test');
select pgflow_tests.poll_and_fail('backoff_test', 1, 1);
select pgflow_tests.unhide_messages('backoff_test');
select pgflow_tests.poll_and_fail('backoff_test', 1, 1);
--
-- TEST: make sure we have proper attempts_count
select is(
  (select attempts_count from pgflow.step_tasks where step_slug = 'last'),
  3,
  'last task should have 3 attempts'
);

-- TEST: verify exponential backoff is set properly
select cmp_ok(
  (select vt_seconds from pgflow_tests.message_timing('last', 'backoff_test') limit 1),
  '>',
  floor(3 * power(2, 2))::int,
  'last step task should have visible time set to at least the base delay'
);

select finish();
rollback;
