begin;
select plan(3);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- SETUP
select pgflow.start_flow('sequential', '{"test": true}'::JSONB);

-- Ensure worker exists
select pgflow_tests.ensure_worker('sequential');

-- TEST: First message should be in the queue and task should be queued
select is(
  (select message ->> 'step_slug' from pgmq.q_sequential limit 1),
  'first',
  'First message should be in the queue'
);

-- TEST: Try to fail a task that is still in 'queued' status (not started)
select pgflow.fail_task(
  (select run_id from pgflow.runs limit 1),
  'first',
  0,
  'Trying to fail queued task'
);

-- TEST: Message should still be in the queue (not archived)
select is(
  (
    select count(*)::INT
    from pgmq.q_sequential
    where message ->> 'step_slug' = 'first'
  ),
  1::INT,
  'Message should still be in the queue since task was not started'
);

-- TEST: Message should not be archived
select is(
  (
    select count(*)::INT
    from pgmq.a_sequential
    where message ->> 'step_slug' = 'first'
  ),
  0::INT,
  'Message should not be archived since task was not started'
);

select finish();
rollback;