BEGIN;
SELECT plan(4);

-- Initialize our mock realtime framework
SELECT pgflow_tests.mock_realtime();

-- Send a test message using our capture function (simulating realtime.send)
SELECT pgflow_tests.capture_realtime_event(
  jsonb_build_object(
    'event_type', 'test:event',
    'test_key', 'test_value'
  ),
  'test:event:name',
  'test:channel',
  false
);

-- Verify a message was created
SELECT is(
  (SELECT count(*)::int FROM pgflow_tests.realtime_calls),
  1,
  'There should be one message in the table'
);

-- Test our custom assertion function for checking event types
SELECT pgflow_tests.assert_realtime_event_sent(
  'test:event',
  'The assert_realtime_event_sent function should work'
);

-- Test our custom event assertion with specific values
SELECT is(
  (SELECT event FROM pgflow_tests.realtime_calls LIMIT 1),
  'test:event:name',
  'Message should have the correct event name'
);

-- Test our custom topic assertion
SELECT is(
  (SELECT topic FROM pgflow_tests.realtime_calls LIMIT 1),
  'test:channel',
  'Message should have the correct topic'
);

SELECT * FROM finish();
ROLLBACK;