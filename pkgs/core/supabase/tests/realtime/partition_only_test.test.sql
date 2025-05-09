begin;
select plan(3);

-- Create a helper table to directly monitor the messages table
create table if not exists pgflow_tests.monitored_messages (
  id serial primary key,
  payload jsonb,
  event text,
  topic text,
  private boolean,
  captured_at timestamptz default now()
);

-- Clear any existing data
truncate pgflow_tests.monitored_messages;

-- 1. CREATE THE PARTITION FOR TODAY (THIS IS THE KEY PART)
do $$
  DECLARE
    today_date date := current_date;
    next_date date := current_date + interval '1 day';
    partition_name text := 'messages_' || to_char(today_date, 'YYYY_MM_DD');
    partition_exists boolean;
  BEGIN
    -- Check if partition already exists
    SELECT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'realtime'
      AND c.relname = partition_name
    ) INTO partition_exists;

    IF partition_exists THEN
      RAISE NOTICE 'Partition % already exists', partition_name;
    ELSE
      BEGIN
        -- Create the partition
        EXECUTE format(
          'CREATE TABLE realtime.%I PARTITION OF realtime.messages
           FOR VALUES FROM (%L) TO (%L)',
          partition_name,
          today_date,
          next_date
        );
        RAISE NOTICE 'Successfully created partition %', partition_name;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error creating partition: %', SQLERRM;
      END;
    END IF;
  END;
$$;

-- 2. TRY TO QUERY THE MESSAGES TABLE DIRECTLY (no triggers)
do $$
  BEGIN
    -- Call realtime.send directly
    PERFORM realtime.send(
      jsonb_build_object('event_type', 'direct_test', 'test', true),
      'test:event',
      'test:topic',
      false
    );
    RAISE NOTICE 'Called realtime.send()';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error calling realtime.send(): %', SQLERRM;
  END;
$$;

-- 3. CHECK IF WE CAN DIRECTLY SEE THE MESSAGE IN REALTIME.MESSAGES
do $$
  DECLARE
    message_count integer;
  BEGIN
    -- Copy data from realtime.messages to our monitoring table
    INSERT INTO pgflow_tests.monitored_messages (payload, event, topic, private)
    SELECT payload, event, topic, private 
    FROM realtime.messages
    WHERE payload->>'event_type' = 'direct_test';
    
    GET DIAGNOSTICS message_count = ROW_COUNT;
    RAISE NOTICE 'Copied % messages from realtime.messages', message_count;
  END;
$$;

-- 4. CHECK IF AN EVENT WAS FOUND
select ok(
  (select count(*) > 0 from pgflow_tests.monitored_messages where payload ->> 'event_type' = 'direct_test'),
  'Should be able to directly access messages in realtime.messages table'
);

-- 5. RESET AND TEST PGFLOW FUNCTIONS (without triggers)
truncate pgflow_tests.monitored_messages;
select pgflow_tests.reset_db();
select pgflow.create_flow('direct_test');
select pgflow.add_step('direct_test', 'test_step');

-- Start the flow
with flow as (
  select * from pgflow.start_flow('direct_test', '{}'::jsonb)
)
select run_id into temporary table_run_id from flow;

-- 6. DIRECTLY QUERY MESSAGES TABLE AGAIN
do $$
  DECLARE
    message_count integer;
  BEGIN
    -- Copy data from realtime.messages to our monitoring table
    INSERT INTO pgflow_tests.monitored_messages (payload, event, topic, private)
    SELECT payload, event, topic, private 
    FROM realtime.messages
    WHERE payload->>'event_type' = 'run:started';
    
    GET DIAGNOSTICS message_count = ROW_COUNT;
    RAISE NOTICE 'Copied % run:started messages from realtime.messages', message_count;
  END;
$$;

-- 7. CHECK IF RUN:STARTED EVENT WAS FOUND
select ok(
  (select count(*) > 0 from pgflow_tests.monitored_messages where payload ->> 'event_type' = 'run:started'),
  'Should be able to directly access run:started event in realtime.messages'
);

-- 8. COMPLETE THE TASK AND CHECK AGAIN
select pgflow_tests.poll_and_complete('direct_test');

-- 9. DIRECTLY QUERY MESSAGES TABLE FOR COMPLETED EVENT
do $$
  DECLARE
    message_count integer;
  BEGIN
    -- Copy data from realtime.messages to our monitoring table
    INSERT INTO pgflow_tests.monitored_messages (payload, event, topic, private)
    SELECT payload, event, topic, private 
    FROM realtime.messages
    WHERE payload->>'event_type' = 'run:completed';
    
    GET DIAGNOSTICS message_count = ROW_COUNT;
    RAISE NOTICE 'Copied % run:completed messages from realtime.messages', message_count;
  END;
$$;

-- Check what we've captured
do $$
  DECLARE
    r record;
    total_count integer;
  BEGIN
    SELECT COUNT(*) INTO total_count FROM pgflow_tests.monitored_messages;
    RAISE NOTICE 'Total monitored messages: %', total_count;

    RAISE NOTICE 'Event types found:';
    FOR r IN SELECT DISTINCT payload->>'event_type' as event_type, COUNT(*)
              FROM pgflow_tests.monitored_messages
              GROUP BY payload->>'event_type'
    LOOP
      RAISE NOTICE '- %: % event(s)', r.event_type, r.count;
    END LOOP;
  END;
$$;

-- Final verification
select ok(
  (select count(*) > 0 from pgflow_tests.monitored_messages where payload ->> 'event_type' = 'run:completed'),
  'Should be able to directly access run:completed event in realtime.messages'
);

-- Clean up
drop table if exists table_run_id;

-- Finish the test
select * from finish();
rollback;