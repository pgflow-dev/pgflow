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

-- make the message immediately visible (bypassing the retry delay)
select pgflow_tests.reset_message_visibility('backoff_test');

-- simulate a task failure
select pgflow_tests.poll_and_fail('backoff_test', 1, 1);

-- TEST: make sure we have proper attempts_count
select is(
  (select attempts_count::int from pgflow.step_tasks where step_slug = 'first'),
  2::int,
  'first task should have 2 attempts'
);

-- TEST: verify exponential backoff is set properly
select is(
  (select vt_seconds from pgflow_tests.message_timing('first', 'backoff_test') limit 1),
  pgflow.calculate_retry_delay(1, 2),
  'first step task should have visible time set to at least the base delay'
);

-- SETUP: proceed to next step
select pgflow_tests.reset_message_visibility('backoff_test');
select pgflow_tests.poll_and_complete('backoff_test', 1, 1);
select pgflow_tests.reset_message_visibility('backoff_test');

-- SETUP: fail twice to verify appropriate backoff
select pgflow_tests.poll_and_fail('backoff_test', 1, 1);
select pgflow_tests.reset_message_visibility('backoff_test');
select pgflow_tests.poll_and_fail('backoff_test', 1, 1);
select pgflow_tests.reset_message_visibility('backoff_test');
select pgflow_tests.poll_and_fail('backoff_test', 1, 1);
--
-- TEST: make sure we have proper attempts_count
select is(
  (select attempts_count from pgflow.step_tasks where step_slug = 'last'),
  3,
  'last task should have 3 attempts'
);

-- TEST: verify exponential backoff is set properly
select pgflow_tests.assert_retry_delay(
  queue_name => 'backoff_test',
  step_slug => 'last',
  expected_delay => pgflow.calculate_retry_delay(2, 3),
  description => 'last step task should have visible time set to at least the base delay'
);

-- select is(
--   (select vt_seconds from pgflow_tests.message_timing('last', 'backoff_test') limit 1),
--   pgflow.calculate_retry_delay(2, 3),
--   'last step task should have visible time set to at least the base delay'
-- );

select finish();
rollback;
