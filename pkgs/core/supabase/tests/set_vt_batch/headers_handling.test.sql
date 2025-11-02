begin;
select plan(3);
select pgflow_tests.reset_db();

-- Create a test queue
select pgmq.create('headers_queue');

-- Send messages without headers
select pgmq.send('headers_queue', '{"msg": "no_headers"}'::jsonb);

-- Send message with headers
select pgmq.send('headers_queue', '{"msg": "with_headers"}'::jsonb, '{"source": "test"}'::jsonb);

-- Get message IDs
with msgs as (
  select array_agg(msg_id order by msg_id) as ids from pgmq.q_headers_queue
)
-- TEST 1: set_vt_batch returns headers column for message without headers (NULL)
select is(
  (select headers from pgflow.set_vt_batch(
    'headers_queue',
    ARRAY[(select ids[1] from msgs)],
    ARRAY[30]
  )),
  NULL,
  'set_vt_batch should return NULL in headers column for message sent without headers'
);

-- TEST 2: set_vt_batch returns headers column for message with headers (non-NULL)
with msgs as (
  select array_agg(msg_id order by msg_id) as ids from pgmq.q_headers_queue
)
select is(
  (select headers->>'source' from pgflow.set_vt_batch(
    'headers_queue',
    ARRAY[(select ids[2] from msgs)],
    ARRAY[30]
  )),
  'test',
  'set_vt_batch should return headers column with correct values for message sent with headers'
);

-- TEST 3: set_vt_batch returns headers column for all messages in batch
with msgs as (
  select array_agg(msg_id order by msg_id) as ids from pgmq.q_headers_queue
)
select ok(
  (select count(*) = 2 from pgflow.set_vt_batch(
    'headers_queue',
    (select ids from msgs),
    ARRAY[30, 40]
  )),
  'set_vt_batch should return headers column for all messages in batch'
);

select finish();
rollback;
