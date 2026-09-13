-- Queue identity snapshots (#650): the stored (queue_name, message_id)
-- identity admits NULL message ids and rejects duplicate non-null pairs,
-- including message ids beyond the JavaScript safe integer range.
begin;
select plan(6);

select pgflow_tests.reset_db();

select pgflow.create_flow('identq', null, null, 5);
select pgflow.add_step('identq', 'a');
select pgflow.start_flow('identq', '"x"'::jsonb);

-- NULL message_id rows are allowed and not part of the identity
insert into pgflow.step_tasks (flow_slug, run_id, step_slug, queue_name, task_index, message_id)
values
  ('identq', (select run_id from pgflow.runs where flow_slug = 'identq'), 'a', 'identq', 97, null),
  ('identq', (select run_id from pgflow.runs where flow_slug = 'identq'), 'a', 'identq', 98, null);

select is(
  (select count(*) from pgflow.step_tasks where step_slug = 'a' and message_id is null),
  2::bigint,
  'multiple NULL message_id task rows are allowed'
);

-- Duplicate non-null (queue_name, message_id) is rejected
select throws_ok(
  $$
    insert into pgflow.step_tasks (flow_slug, run_id, step_slug, queue_name, task_index, message_id)
    select flow_slug, run_id, 'a', queue_name, 99, message_id
    from pgflow.step_tasks
    where step_slug = 'a' and message_id is not null
  $$,
  'duplicate key value violates unique constraint "idx_step_tasks_queue_message"',
  'duplicate (queue_name, message_id) pair is rejected'
);

-- Message ids beyond the safe integer range are stored and compared exactly
insert into pgflow.step_tasks (flow_slug, run_id, step_slug, queue_name, task_index, message_id)
values
  ('identq', (select run_id from pgflow.runs where flow_slug = 'identq'), 'a', 'identq', 100, 9007199254740993),
  ('identq', (select run_id from pgflow.runs where flow_slug = 'identq'), 'a', 'identq', 101, 9223372036854775807);

select is(
  (select count(*) from pgflow.step_tasks where message_id = 9007199254740993::bigint),
  1::bigint,
  'message id 2^53+1 is stored exactly'
);

select is(
  (select count(*) from pgflow.step_tasks where message_id = 9007199254740992::bigint),
  0::bigint,
  'exact bigint comparison does not round to the nearest double'
);

select throws_ok(
  $$
    insert into pgflow.step_tasks (flow_slug, run_id, step_slug, queue_name, task_index, message_id)
    values (
      'identq',
      (select run_id from pgflow.runs where flow_slug = 'identq'),
      'a',
      'identq',
      102,
      9007199254740993
    )
  $$,
  'duplicate key value violates unique constraint "idx_step_tasks_queue_message"',
  'duplicate pair rejected with ids beyond the safe integer range'
);

-- The same message id under a different queue is a different identity
select pgflow.create_flow('identq2', null, null, 5);
select pgflow.add_step('identq2', 'a');
select pgflow.start_flow('identq2', '"x"'::jsonb);

select lives_ok(
  $$
    update pgflow.step_tasks
    set message_id = (select message_id from pgflow.step_tasks where flow_slug = 'identq' and task_index = 0)
    where flow_slug = 'identq2' and task_index = 0
  $$,
  'the same message id in another queue does not collide'
);

select finish();
rollback;
