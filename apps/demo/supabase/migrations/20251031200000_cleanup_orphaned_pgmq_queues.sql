-- Cleanup any orphaned pgmq queues from incomplete resets
-- This ensures a clean slate before flow migrations run
-- Note: The primary cleanup now happens in db-reset-preview.sh BEFORE reset,
-- while pgmq.list_queues() still works. This migration is a fallback.

DO $$
DECLARE
  queue_record RECORD;
BEGIN
  -- Drop any existing queues that might be orphaned
  FOR queue_record IN
    SELECT queue_name
    FROM pgmq.list_queues()
  LOOP
    PERFORM pgmq.drop_queue(queue_record.queue_name);
    RAISE NOTICE 'Dropped orphaned queue: %', queue_record.queue_name;
  END LOOP;
END $$;
