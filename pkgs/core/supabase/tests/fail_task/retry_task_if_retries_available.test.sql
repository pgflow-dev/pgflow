begin;
select plan(4);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- SETUP
select pgflow.start_flow('sequential', '{"test": true}'::JSONB);
select pgflow_tests.poll_and_fail('sequential');

-- TEST: The task should be queued
select is(
  (select status from pgflow.step_tasks where flow_slug = 'sequential' and step_slug = 'first'),
  'queued',
  'The task should be queued'
);

-- TEST: The task should have attempts_count incremented
select is(
  (select attempts_count from pgflow.step_tasks where flow_slug = 'sequential' and step_slug = 'first'),
  1,
  'The task should have attempts_count incremented'
);

-- TEST: The task should have null error_message
select is(
  (select error_message from pgflow.step_tasks where flow_slug = 'sequential' and step_slug = 'first'),
  'first FAILED',
  'The task should have attempts_count incremented'
);

-- TEST: The task's message should be in the queue
select is(
  (select message ->> 'step_slug' from pgmq.q_sequential limit 1),
  'first',
  'The task''s message should be in the queue'
);

select finish();
rollback;
