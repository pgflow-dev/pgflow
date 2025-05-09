begin;
select plan(1);

-- This test deliberately skips partition creation to see what happens

-- 1. TRY TO CALL REALTIME.SEND DIRECTLY (no partition creation)
do $$
  BEGIN
    -- Call realtime.send directly
    PERFORM realtime.send(
      jsonb_build_object('event_type', 'direct_test', 'test', true),
      'test:event',
      'test:topic',
      false
    );
    RAISE NOTICE 'Called realtime.send() successfully';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error calling realtime.send(): %', SQLERRM;
  END;
$$;

-- 2. TRY TO READ FROM REALTIME.MESSAGES TABLE
do $$
  DECLARE
    message_count integer;
  BEGIN
    SELECT COUNT(*) INTO message_count
    FROM realtime.messages
    WHERE payload->>'event_type' = 'direct_test';
    
    RAISE NOTICE 'Found % direct_test messages in realtime.messages', message_count;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error reading from realtime.messages: %', SQLERRM;
  END;
$$;

-- Check if we can find the message
-- Note: This test might fail if realtime.send() silently fails without partition
select ok(
  (select count(*) > 0 from realtime.messages where payload ->> 'event_type' = 'direct_test'),
  'Test if the message appears in realtime.messages without partition creation'
);

-- Also check what happens when starting a flow
do $$
  BEGIN
    -- Clean up any existing test flow
    DELETE FROM pgflow.flows WHERE flow_slug = 'missing_partition_test';
    -- Create a test flow
    PERFORM pgflow.create_flow('missing_partition_test');
    PERFORM pgflow.add_step('missing_partition_test', 'test_step');
    -- Try to start it
    PERFORM pgflow.start_flow('missing_partition_test', '{}'::jsonb);
    RAISE NOTICE 'Successfully started flow without partition';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error starting flow: %', SQLERRM;
  END;
$$;

-- Finish the test
select * from finish();
rollback;