begin;
select plan(3);
select pgflow_tests.reset_db();
select pgflow_tests.setup_helpers();
select pgflow_tests.setup_flow('sequential');

-- SETUP
select pgflow.start_flow('sequential', '{"test": true}'::JSONB);
select poll_and_fail('sequential');

-- TEST: The task should be queued
select is(
  (select status from pgflow.step_tasks where flow_slug = 'sequential' and step_slug = 'first'),
  'queued',
  'The task should be queued'
);

-- TEST: The task should have retry_count incremented
select is(
  (select retry_count from pgflow.step_tasks where flow_slug = 'sequential' and step_slug = 'first'),
  1,
  'The task should have retry_count incremented'
);

-- TEST: The task's message should be in the queue
select is(
  (select message ->> 'step_slug' from pgmq.q_sequential limit 1),
  'first',
  'The task''s message should be in the queue'
);

select finish();
rollback;
