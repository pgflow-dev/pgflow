begin;
select plan(4);
select pgflow_tests.reset_db();

-- Create a test queue
select pgmq.create('validation_queue');

-- TEST: Mismatched array lengths should raise exception
select throws_ok(
  $$ select * from pgflow.set_vt_batch('validation_queue', ARRAY[1, 2], ARRAY[30]) $$,
  'msg_ids length (2) must equal vt_offsets length (1)',
  'Should raise exception when array lengths do not match'
);

-- TEST: NULL msg_ids should return empty set
select is(
  (select count(*)::int from pgflow.set_vt_batch('validation_queue', NULL, ARRAY[30])),
  0,
  'NULL msg_ids should return empty set'
);

-- TEST: NULL vt_offsets should return empty set
select is(
  (select count(*)::int from pgflow.set_vt_batch('validation_queue', ARRAY[1], NULL)),
  0,
  'NULL vt_offsets should return empty set'
);

-- TEST: Both arrays NULL should return empty set
select is(
  (select count(*)::int from pgflow.set_vt_batch('validation_queue', NULL, NULL)),
  0,
  'Both arrays NULL should return empty set'
);

select finish();
rollback;