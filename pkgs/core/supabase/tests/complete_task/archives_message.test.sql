begin;
select plan(5);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- SETUP
select pgflow.start_flow('sequential', '{"test": true}'::JSONB);

-- Ensure worker exists
select pgflow_tests.ensure_worker('sequential');

-- TEST: First message shoud be in the queue
select is(
  (select message ->> 'step_slug' from pgmq.q_sequential limit 1),
  'first',
  'First message should be in the queue'
);

-- SETUP: Start the task first
with msg_ids as (
  select array_agg(message_id) as ids
  from pgflow.step_tasks
  where run_id = (select run_id from pgflow.runs limit 1)
    and step_slug = 'first'
    and status = 'queued'
)
select pgflow.start_tasks(
  (select ids from msg_ids),
  '11111111-1111-1111-1111-111111111111'::uuid
);

select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'first',
  0,
  '"first was successful"'::JSONB
);

-- TEST: First message shoud be archived
select is(
  (
    select count(*)::INT
    from pgmq.q_sequential
    where message ->> 'step_slug' = 'first'
  ),
  0::INT,
  'There should be no messages in the queue'
);
select is(
  (
    select count(*)::INT
    from pgmq.a_sequential
    where message ->> 'step_slug' = 'first'
    limit 1
  ),
  1::INT,
  'The message should be archived'
);

-- TEST: Other messages shoud not be archived
select is(
  (
    select count(*)::INT
    from pgmq.q_sequential
    where message ->> 'step_slug' = 'second'
  ),
  1::INT,
  'There should be no messages in the queue'
);
select is(
  (
    select count(*)::INT
    from pgmq.a_sequential
    where message ->> 'step_slug' = 'second'
    limit 1
  ),
  0::INT,
  'The other message should not be archived'
);

select finish();
rollback;
