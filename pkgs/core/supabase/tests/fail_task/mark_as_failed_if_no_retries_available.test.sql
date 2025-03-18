begin;
select plan(5);
select pgflow_tests.reset_db();
select pgflow_tests.setup_helpers();

-- SETUP
select pgflow.create_flow('with_retry');
select pgflow.add_step('with_retry', 'first', max_attempts => 0, base_delay => 0);
select pgflow.start_flow('with_retry', '{"test": true}'::JSONB);

-- max_attempts is 0, so failing once should mark the task as failed
select poll_and_fail('with_retry');

-- TEST: The task should be queued
select is(
  (select status from pgflow.step_tasks where flow_slug = 'with_retry' and step_slug = 'first'),
  'failed',
  'The task should be failed'
);

-- TEST: The task should have null error_message
select is(
  (select error_message from pgflow.step_tasks where flow_slug = 'with_retry' and step_slug = 'first'),
  'first FAILED',
  'The task should have attempts_count incremented'
);

-- TEST: The task's message should be in the queue
select is(
  (select count(*)::int from pgmq.q_with_retry),
  0,
  'There should be no messages in the queue'
);

-- TEST: The step should be marked as failed
select is(
  (select status from pgflow.step_states where flow_slug = 'with_retry' and step_slug = 'first' limit 1),
  'failed',
  'The step should be marked as failed'
);

-- TEST: The run should be marked as failed
select is(
  (select status from pgflow.runs where flow_slug = 'with_retry' limit 1),
  'failed',
  'The run should be marked as failed'
);

select finish();
rollback;
