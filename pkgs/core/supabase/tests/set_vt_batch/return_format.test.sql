begin;
select plan(7);
select pgflow_tests.reset_db();

-- Create a test queue
select pgmq.create('return_queue');

-- Send test messages with different content
select pgmq.send('return_queue', '{"msg": "first", "data": 1}'::jsonb);
select pgmq.send('return_queue', '{"msg": "second", "data": 2}'::jsonb);

-- Get message IDs for testing
with msgs as (
  select array_agg(msg_id order by msg_id) as ids from pgmq.q_return_queue
)
-- TEST: Returned records should have correct msg_id
select is(
  (select count(*)::int from pgflow.set_vt_batch('return_queue', (select ids from msgs), ARRAY[30, 60]) where msg_id is not null),
  2,
  'All returned records should have valid msg_id'
);

-- TEST: Returned records should have read_ct field
with msgs as (
  select array_agg(msg_id order by msg_id) as ids from pgmq.q_return_queue
)
select is(
  (select count(*)::int from pgflow.set_vt_batch('return_queue', (select ids from msgs), ARRAY[30, 60]) where read_ct is not null),
  2,
  'All returned records should have read_ct field'
);

-- TEST: Returned records should have enqueued_at field
with msgs as (
  select array_agg(msg_id order by msg_id) as ids from pgmq.q_return_queue
)
select is(
  (select count(*)::int from pgflow.set_vt_batch('return_queue', (select ids from msgs), ARRAY[30, 60]) where enqueued_at is not null),
  2,
  'All returned records should have enqueued_at field'
);

-- TEST: Returned records should have updated vt field
with msgs as (
  select array_agg(msg_id order by msg_id) as ids from pgmq.q_return_queue
)
select is(
  (select count(*)::int from pgflow.set_vt_batch('return_queue', (select ids from msgs), ARRAY[30, 60]) where vt is not null),
  2,
  'All returned records should have updated vt field'
);

-- TEST: Returned records should have message field
with msgs as (
  select array_agg(msg_id order by msg_id) as ids from pgmq.q_return_queue
)
select is(
  (select count(*)::int from pgflow.set_vt_batch('return_queue', (select ids from msgs), ARRAY[30, 60]) where message is not null),
  2,
  'All returned records should have message field'
);

-- TEST: Message content should be preserved
with msgs as (
  select array_agg(msg_id order by msg_id) as ids from pgmq.q_return_queue
)
select is(
  (select count(*)::int from pgflow.set_vt_batch('return_queue', (select ids from msgs), ARRAY[30, 60]) where message ? 'msg'),
  2,
  'Message content should be preserved in returned records'
);

-- TEST: Returned records should have headers field as NULL (messages sent without headers)
with msgs as (
  select array_agg(msg_id order by msg_id) as ids from pgmq.q_return_queue
)
select is(
  (select count(*)::int from pgflow.set_vt_batch('return_queue', (select ids from msgs), ARRAY[30, 60]) where headers is null),
  2,
  'Messages sent without headers should return NULL in headers field'
);

select finish();
rollback;