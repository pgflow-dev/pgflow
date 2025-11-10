-- Cleanup any orphaned pgmq queues from incomplete resets
-- This ensures a clean slate before flow migrations run

DO $$
DECLARE
  queue_record RECORD;
BEGIN
  -- Drop any existing queues that might be orphaned
  -- This handles the case where DROP EXTENSION pgmq didn't cascade properly
  FOR queue_record IN
    SELECT queue_name
    FROM pgmq.list_queues()
  LOOP
    -- Use pgmq's built-in drop function to safely remove the queue
    PERFORM pgmq.drop_queue(queue_record.queue_name);

    RAISE NOTICE 'Dropped orphaned queue: %', queue_record.queue_name;
  END LOOP;

  -- Also drop any orphaned sequences that might exist without tables
  FOR queue_record IN
    SELECT sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'pgmq'
      AND sequence_name LIKE 'q_%_msg_id_seq'
  LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS pgmq.%I CASCADE', queue_record.sequence_name);

    RAISE NOTICE 'Dropped orphaned sequence: %', queue_record.sequence_name;
  END LOOP;

END $$;
