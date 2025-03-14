begin;
select plan(3);
select pgflow_tests.reset_db();
select pgflow_tests.setup_helpers();
select pgflow_tests.setup_flow('sequential');

-- SETUP
select pgflow.start_flow('sequential', '{"test": true}'::JSONB);

-- default retry_limit is 1, so failing twice should mark the task as failed
select poll_and_fail('sequential');
select poll_and_fail('sequential');

-- TEST: The task should be queued
select is(
  (select status from pgflow.step_tasks where flow_slug = 'sequential' and step_slug = 'first'),
  'failed',
  'The task should be failed'
);

-- TEST: The task should have null error_message
select is(
  (select error_message from pgflow.step_tasks where flow_slug = 'sequential' and step_slug = 'first'),
  'first FAILED',
  'The task should have retry_count incremented'
);

-- TEST: The task's message should be in the queue
select is(
  (select count(*)::int from pgmq.q_sequential),
  0,
  'There should be no messages in the queue'
);

select finish();
rollback;
