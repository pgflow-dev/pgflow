import { describe, it, expect } from 'vitest';
import { withPgNoTransaction } from '../helpers/db.js';
import { createTestSupabaseClient } from '../helpers/setup.js';

describe('Realtime Send Integration', () => {
  it(
    'receives events sent via realtime.send() SQL function',
    withPgNoTransaction(async (sql) => {
      // 1. Create Supabase client with real credentials
      const supabaseClient = createTestSupabaseClient();
      const testChannel = 'test-realtime-sql-send';

      const receivedEvents: any[] = [];

      // 3. Subscribe to broadcast channel
      const channel = supabaseClient.channel(testChannel);

      channel.on('broadcast', { event: '*' }, (payload) => {
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
          ${sql.json(dbPayload)}::jsonb,
          'test-sql-event',
          ${testChannel},
          false
        )
      `;
      console.log('realtime.send() called successfully');

      // 5. Wait for the event to be received
      const timeoutMs = 15_000;
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

      // Check that our payload fields are present (ignore the auto-added 'id' field)
      const receivedPayload = receivedEvents[0].payload;
      expect(receivedPayload.test_message).toEqual(dbPayload.test_message);
      expect(receivedPayload.timestamp).toEqual(dbPayload.timestamp);
      expect(receivedPayload.counter).toEqual(dbPayload.counter);
      expect(receivedPayload.source).toEqual(dbPayload.source);

      // Clean up
      await channel.unsubscribe();
    }),
    { timeout: 10000 }
  );
});
