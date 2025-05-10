-- Test for pgflow_tests.create_realtime_partition() function
BEGIN;

SELECT plan(6);

-- Clear previous data
SELECT pgflow_tests.reset_db();

-- 1. Test function exists with correct signature
SELECT has_function(
  'pgflow_tests', 'create_realtime_partition', ARRAY['date'],
  'Function create_realtime_partition(date) should exist'
);

-- 2. First drop the partition if it exists to ensure a clean test state
DO $$
DECLARE
  partition_name text := 'messages_' || to_char(current_date, 'YYYY_MM_DD');
BEGIN
  EXECUTE format('DROP TABLE IF EXISTS realtime.%I', partition_name);
END;
$$;

-- 3. Verify that the partition doesn't exist after dropping
SELECT is(
  (SELECT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'realtime'
    AND c.relname = 'messages_' || to_char(current_date, 'YYYY_MM_DD')
  )),
  false,
  'Partition should not exist before test'
);

-- 4. Test that the function creates a partition that doesn't exist
SELECT is(
  pgflow_tests.create_realtime_partition(),
  true,
  'Should return true when creating a new partition'
);

-- 5. Check that the partition actually exists in the system catalog
SELECT is(
  (SELECT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'realtime'
    AND c.relname = 'messages_' || to_char(current_date, 'YYYY_MM_DD')
  )),
  true,
  'Partition should exist in system catalog after creation'
);

-- 6. Test that calling the function again returns false (idempotent)
SELECT is(
  pgflow_tests.create_realtime_partition(),
  false,
  'Should return false when partition already exists'
);

-- 7. Test that realtime.send() works after creating the partition
-- First, clear any existing messages
DELETE FROM realtime.messages WHERE payload->>'event_type' = 'partition_test';

-- Now send a test message
SELECT realtime.send(
  jsonb_build_object('event_type', 'partition_test', 'message', 'Testing partition creation'),
  'test:event',
  'test:topic',
  false
);

-- Use is() to exactly compare the count as integers
SELECT is(
  (SELECT COUNT(*)::int FROM realtime.messages WHERE payload->>'event_type' = 'partition_test'),
  1,
  'realtime.send() should insert exactly 1 message'
);

-- Finish the test
SELECT * FROM finish();
ROLLBACK;