begin;
select plan(2);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database and create test flow
select pgflow_tests.reset_db();
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'step1');

-- Test 1: Empty string should be rejected by CHECK constraint
select throws_ok(
  $$select pgflow.start_flow('test_flow', '{}'::jsonb, realtime := '')$$,
  'new row for relation "runs" violates check constraint',
  'Empty realtime channel name should be rejected'
);

-- Test 2: NULL should be accepted (disables realtime)
select lives_ok(
  $$select pgflow.start_flow('test_flow', '{}'::jsonb, realtime := NULL)$$,
  'NULL realtime channel should be accepted (disables realtime)'
);

select finish();
rollback;