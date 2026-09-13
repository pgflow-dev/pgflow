-- Provisioning rules (#650): reject a listed queue that already uses a flow's
-- normalized default queue name; existing matching flows reuse their queue;
-- normalized flow collisions are rejected atomically, including direct SQL.
begin;
select plan(13);

select pgflow_tests.reset_db();

-- External queue with the same normalized name blocks a new flow
select pgmq.create('TakenName');

select throws_ok(
  $$select pgflow.create_flow('TakenName')$$,
  'cannot create flow "TakenName": queue "takenname" is already in use by another owner',
  'flow with an externally taken normalized queue name is rejected'
);

select throws_ok(
  $$select pgflow.create_flow('takenname')$$,
  'cannot create flow "takenname": queue "takenname" is already in use by another owner',
  'normalized collision is rejected regardless of case'
);

select is(
  (select count(*) from pgflow.flows where lower(flow_slug) = 'takenname'),
  0::bigint,
  'rejected flow creation left no flow row'
);

-- Normalized flow collision is rejected atomically, including direct SQL
insert into pgflow.flows (flow_slug) values ('MyFlow');

select throws_ok(
  $$insert into pgflow.flows (flow_slug) values ('myflow')$$,
  'duplicate key value violates unique constraint "idx_flows_normalized_slug"',
  'direct SQL cannot create a second flow with the same normalized name'
);

select throws_ok(
  $$select pgflow.create_flow('MYFLOW')$$,
  'duplicate key value violates unique constraint "idx_flows_normalized_slug"',
  'create_flow cannot register a case variant of an existing flow'
);

-- An existing matching flow reuses its queue (idempotent re-registration)
select pgmq.create('MyFlow');

select lives_ok(
  $$select pgflow.create_flow('MyFlow')$$,
  'existing flow re-registers and reuses its listed queue'
);

select is(
  (select count(*) from pgmq.list_queues() where lower(queue_name) = 'myflow'),
  1::bigint,
  'reuse does not create a second metadata entry'
);

-- Empty flows still get their default queue
select pgflow.create_flow('emptyflow');

select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'emptyflow'),
  1::bigint,
  'create_flow provisions the default queue for an empty flow'
);

-- Queue-name validity on the persisted columns
select throws_ok(
  $$select pgflow.create_flow(repeat('a', 48))$$,
  'queue name is too long, maximum length is 48 characters',
  'flow slugs beyond the queue-name limit are rejected by PGMQ validation'
);

select throws_ok(
  $$
    insert into pgflow.steps (flow_slug, step_slug, queue_name)
    values ('emptyflow', 's', 'NotLowercase')
  $$,
  'new row for relation "steps" violates check constraint "queue_name_is_valid"',
  'steps reject a non-canonical queue name'
);

select throws_ok(
  $$
    insert into pgflow.steps (flow_slug, step_slug, queue_name)
    values ('emptyflow', 's', repeat('q', 48))
  $$,
  'new row for relation "steps" violates check constraint "queue_name_is_valid"',
  'steps reject a queue name beyond 47 characters'
);

select is(
  (select pgflow.is_valid_queue_name('ok')),
  true,
  'is_valid_queue_name accepts canonical lowercase names'
);

select ok(
  not pgflow.is_valid_queue_name('Mixed')
  and pgflow.is_valid_queue_name(repeat('q', 47))
  and not pgflow.is_valid_queue_name(repeat('q', 48))
  and not pgflow.is_valid_queue_name(''),
  'is_valid_queue_name enforces lowercase and the 47-character limit'
);

select finish();
rollback;
