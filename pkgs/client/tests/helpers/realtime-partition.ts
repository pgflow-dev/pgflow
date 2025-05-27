import type { Sql } from 'postgres';

/**
 * Creates realtime partition for the current date if it doesn't exist.
 * This is a workaround for a Supabase/realtime bug where partitions aren't immediately 
 * available after db-reset, causing realtime.send() to silently fail.
 */
export async function ensureRealtimePartition(sql: Sql): Promise<void> {
  await sql`
    DO $$
    DECLARE
      target_date date := CURRENT_DATE;
      next_date date := target_date + interval '1 day';
      partition_name text := 'messages_' || to_char(target_date, 'YYYY_MM_DD');
      partition_exists boolean;
    BEGIN
      -- Check if partition already exists
      SELECT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'realtime'
        AND c.relname = partition_name
      ) INTO partition_exists;

      -- Create partition if it doesn't exist
      IF NOT partition_exists THEN
        EXECUTE format(
          'CREATE TABLE realtime.%I PARTITION OF realtime.messages
           FOR VALUES FROM (%L) TO (%L)',
          partition_name,
          target_date,
          next_date
        );
        
        -- Quick patch: Add partition to realtime publication for local dev
        EXECUTE format('ALTER TABLE realtime.%I REPLICA IDENTITY FULL', partition_name);
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE realtime.messages';
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE realtime.%I', partition_name);
        
        -- Grant same permissions as main realtime.messages table
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE realtime.%I TO anon, authenticated, service_role', partition_name);
        EXECUTE format('GRANT ALL ON TABLE realtime.%I TO supabase_realtime_admin, postgres, dashboard_user', partition_name);
        
        -- Enable RLS and create policies for realtime broadcast authorization
        EXECUTE format('ALTER TABLE realtime.%I ENABLE ROW LEVEL SECURITY', partition_name);
        EXECUTE format('CREATE POLICY "Allow service_role to receive broadcasts" ON realtime.%I FOR SELECT TO service_role USING (true)', partition_name);
        EXECUTE format('CREATE POLICY "Allow service_role to send broadcasts" ON realtime.%I FOR INSERT TO service_role WITH CHECK (true)', partition_name);
        
        RAISE NOTICE 'Created partition % for date range % to %',
          partition_name, target_date, next_date;
      ELSE
        RAISE NOTICE 'Partition % already exists', partition_name;
      END IF;
    END;
    $$
  `;
}