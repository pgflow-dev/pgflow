begin;
select plan(2);
select pgflow_tests.reset_db();

select pgflow.create_flow('simple', max_attempts => 3, base_delay => 0);
select pgflow.add_step('simple', 'first');
select pgflow.add_step('simple', 'last');
select pgflow.start_flow('simple', '"hello"'::jsonb);

-- SETUP: poll twice, first fialing them completing
select pgflow_tests.poll_and_fail('simple', 1, 1);
select pgflow_tests.poll_and_complete('simple', 1, 1);

-- TEST: polling increments, regardless of failure/completion
select is(
  (select attempts_count::int from pgflow.step_tasks where step_slug = 'first'),
  2,
  'Polling a task should increment its attempts_count, regardless of status'
);

-- SETUP:
select pgflow_tests.poll_and_fail('simple', 1, 1);
select pgflow_tests.poll_and_fail('simple', 1, 1);
select pgflow_tests.poll_and_fail('simple', 1, 1);

-- TEST: polling increments, regardless of failure/completion
select is(
  (select attempts_count::int from pgflow.step_tasks where step_slug = 'last'),
  3,
  'Polling a task should increment its attempts_count'
);


select finish();
rollback;
