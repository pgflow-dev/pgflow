begin;
select plan(2);
select pgflow_tests.reset_db();

-- Create a test queue
select pgmq.create('security_queue');

-- Send a test message
select pgmq.send('security_queue', '{"msg": "test"}'::jsonb);

-- Get the message ID
with msg as (
  select msg_id from pgmq.q_security_queue limit 1
)
-- TEST: Function should work with valid queue name
select is(
  (select count(*)::int from pgflow.set_vt_batch(
    'security_queue',
    ARRAY[(select msg_id from msg)],
    ARRAY[30]
  )),
  1,
  'Valid queue name should work correctly'
);

-- TEST: Function should handle non-existent queue gracefully
-- This should raise an exception due to pgmq.format_table_name validation
select throws_ok(
  $$ select * from pgflow.set_vt_batch('nonexistent_queue', ARRAY[1], ARRAY[30]) $$,
  '42P01',  -- relation does not exist error code
  'relation "pgmq.q_nonexistent_queue" does not exist'
);

select finish();
rollback;