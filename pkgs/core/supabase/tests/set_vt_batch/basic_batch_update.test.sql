begin;
select plan(5);
select pgflow_tests.reset_db();

-- Create a test queue
select pgmq.create('test_queue');

-- Send some test messages
select pgmq.send('test_queue', '{"msg": "first"}'::jsonb);
select pgmq.send('test_queue', '{"msg": "second"}'::jsonb);
select pgmq.send('test_queue', '{"msg": "third"}'::jsonb);

-- Get the message IDs
with msgs as (
  select msg_id from pgmq.q_test_queue order by msg_id
),
msg_array as (
  select array_agg(msg_id) as ids from msgs
)
-- TEST: set_vt_batch updates multiple messages and returns them
select is(
  (select count(*)::int from pgflow.set_vt_batch(
    'test_queue',
    (select ids from msg_array),
    ARRAY[30, 60, 90]
  )),
  3,
  'set_vt_batch should return 3 updated messages'
);

-- TEST: Messages should have updated visibility timeouts
with msgs as (
  select msg_id, vt from pgmq.q_test_queue order by msg_id
),
vt_diffs as (
  select 
    msg_id,
    extract(epoch from (vt - now()))::int as vt_seconds
  from msgs
),
expected_delays as (
  select unnest(ARRAY[30, 60, 90]) as expected_delay
),
actual_vs_expected as (
  select 
    row_number() over (order by msg_id) as rn,
    vt_seconds
  from vt_diffs
),
comparison as (
  select 
    ave.vt_seconds,
    ed.expected_delay,
    abs(ave.vt_seconds - ed.expected_delay) as diff
  from actual_vs_expected ave
  join expected_delays ed on ed.expected_delay = case ave.rn when 1 then 30 when 2 then 60 when 3 then 90 end
)
select ok(
  (select bool_and(diff <= 2) from comparison),
  'All messages should have visibility timeouts within 2 seconds of expected values'
);

-- TEST: Empty arrays should return no results
select is(
  (select count(*)::int from pgflow.set_vt_batch('test_queue', ARRAY[]::bigint[], ARRAY[]::int[])),
  0,
  'Empty arrays should return no results'
);

-- TEST: Non-existent message IDs should return no results
select is(
  (select count(*)::int from pgflow.set_vt_batch('test_queue', ARRAY[99999], ARRAY[30])),
  0,
  'Non-existent message IDs should return no results'
);

-- TEST: Function should handle single message correctly
with first_msg as (
  select msg_id from pgmq.q_test_queue order by msg_id limit 1
)
select is(
  (select count(*)::int from pgflow.set_vt_batch(
    'test_queue',
    ARRAY[(select msg_id from first_msg)],
    ARRAY[120]
  )),
  1,
  'Single message should be updated correctly'
);

select finish();
rollback;