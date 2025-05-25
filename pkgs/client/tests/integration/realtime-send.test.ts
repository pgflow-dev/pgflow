import { describe, it, expect, beforeEach } from 'vitest';
import { withPgNoTransaction } from '../helpers/db.js';
import { createTestSupabaseClient } from '../helpers/setup.js';

describe('Realtime Send Integration', () => {
  it(
    'receives events sent via realtime.send() SQL function',
    withPgNoTransaction(async (sql) => {
      // 0. Temporary fix: Grant schema access to service_role for PostgREST
      await sql`GRANT USAGE ON SCHEMA pgflow TO anon, authenticated, service_role`;
      await sql`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgflow TO anon, authenticated, service_role`;
      await sql`GRANT SELECT ON TABLE pgflow.flows, pgflow.steps TO anon, authenticated, service_role`;

      // 1. Create realtime partition - fixes Supabase/realtime bug after db-reset
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
          END IF;
        END;
        $$
      `;

      // 2. Create Supabase client with real credentials
      const supabaseClient = createTestSupabaseClient();
      const testChannel = 'test-realtime-sql-send';

      let receivedEvents: any[] = [];

      // 3. Subscribe to broadcast channel
      const channel = supabaseClient.channel(testChannel);

      channel.on('broadcast', (payload) => {
        console.log('Received broadcast event:', payload);
        receivedEvents.push(payload);
      });

      // Subscribe to channel and wait for joined state
      const subscriptionPromise = new Promise((resolve) => {
        channel.subscribe((status) => {
          console.log('Channel subscription status:', status);
          if (status === 'SUBSCRIBED') {
            resolve(status);
          }
        });
      });

      // Wait for subscription to be fully established
      await subscriptionPromise;
      console.log('Channel fully subscribed and ready');

      // Additional wait to ensure realtime connection is stable
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 4. Send event via SQL realtime.send() function
      const dbPayload = {
        test_message: 'Hello from SQL realtime.send()!',
        timestamp: new Date().toISOString(),
        counter: 42,
        source: 'database',
      };

      console.log('Sending broadcast via realtime.send()...');
      await sql`
        SELECT realtime.send(
          ${JSON.stringify(dbPayload)}::jsonb,
          'test-sql-event',
          ${testChannel},
          false
        )
      `;
      console.log('realtime.send() called successfully');

      // 5. Wait for the event to be received
      const timeoutMs = 3000;
      const startTime = Date.now();

      while (
        receivedEvents.length === 0 &&
        Date.now() - startTime < timeoutMs
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // 6. Verify the event was received
      console.log('Final received events:', receivedEvents);

      expect(receivedEvents.length).toBeGreaterThan(0);
      expect(receivedEvents[0].payload).toEqual(dbPayload);

      // Clean up
      await channel.unsubscribe();
    }),
    { timeout: 10000 }
  );
});
