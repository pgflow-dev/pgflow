import { assertEquals } from '@std/assert';
import { createQueueWorker } from '../../src/queue/createQueueWorker.ts';
import { withTransaction } from '../db.ts';
import { createFakeLogger } from '../fakes.ts';
import { log, waitFor } from '../e2e/_helpers.ts';
import { sendBatch } from '../helpers.ts';
import type { postgres } from '../sql.ts';
import { delay } from '@std/async';

/**
 * Helper to get message visibility time from pgmq queue table
 */
async function getMessageVisibilityTime(
  sql: postgres.Sql,
  queueName: string,
  msgId: number
): Promise<number | null> {
  const result = await sql<{ vt_seconds: number }[]>`
    SELECT EXTRACT(EPOCH FROM (vt - now()))::int as vt_seconds
    FROM pgmq.q_${sql.unsafe(queueName)}
    WHERE msg_id = ${msgId}
  `;
  return result[0]?.vt_seconds ?? null;
}

/**
 * Creates a handler that always fails and tracks failure times
 */
function createFailingHandler() {
  const failureTimes: number[] = [];
  return {
    handler: () => {
      failureTimes.push(Date.now());
      log(`Failure #${failureTimes.length} at ${new Date().toISOString()}`);
      throw new Error('Intentional failure for legacy config test');
    },
    getFailureCount: () => failureTimes.length,
    getFailureTimes: () => failureTimes,
  };
}

/**
 * Test verifies that legacy retryLimit and retryDelay still work (backwards compatibility)
 */
Deno.test(
  'queue worker supports legacy retryLimit and retryDelay config',
  withTransaction(async (sql) => {
    const { handler, getFailureCount } = createFailingHandler();
    
    // Track warning messages through logger
    const warnMessages: string[] = [];
    const customCreateLogger = (module: string) => ({
      ...createFakeLogger(module),
      warn: (msg: string, _data?: unknown) => {
        log(`WARN: ${msg}`);
        warnMessages.push(msg);
      },
    });
    
    const worker = createQueueWorker(
      handler,
      {
        sql,
        maxPollSeconds: 1,
        retryLimit: 2,    // Legacy config
        retryDelay: 5,    // Legacy config
        queueName: 'legacy_retry_test',
      },
      customCreateLogger
    );

    try {
      // Verify deprecation warning was shown
      assertEquals(
        warnMessages.some(msg => msg.includes('retryLimit and retryDelay are deprecated')),
        true,
        'Should show deprecation warning for legacy config'
      );

      // Start worker and send test message
      worker.startOnlyOnce({
        edgeFunctionName: 'legacy-retry-test',
        workerId: crypto.randomUUID(),
      });
      
      // Wait for worker to be ready
      await delay(100);

      // Send a single message
      const [{ send_batch: msgIds }] = await sendBatch(
        1,
        'legacy_retry_test',
        sql
      );
      const msgId = msgIds[0];
      log(`Sent message with ID: ${msgId}`);

      // Collect visibility times after each failure
      const visibilityTimes: number[] = [];

      for (let i = 1; i <= 2; i++) {
        // Wait for failure
        await waitFor(() => getFailureCount() >= i, {
          timeoutMs: 15000,
        });

        // Get visibility time after failure
        const vt = await getMessageVisibilityTime(
          sql,
          'legacy_retry_test',
          msgId
        );
        if (vt !== null) {
          visibilityTimes.push(vt);
          log(`Visibility time after failure #${i}: ${vt}s`);
        }
      }

      // Calculate individual retry delays from visibility times
      const actualDelays: number[] = [];
      for (let i = 0; i < visibilityTimes.length; i++) {
        if (i === 0) {
          actualDelays.push(visibilityTimes[i]);
        } else {
          actualDelays.push(visibilityTimes[i] - visibilityTimes[i - 1]);
        }
      }

      // Legacy config should result in fixed delays (with some tolerance for timing)
      // First delay might have +1s due to processing time or pgmq internals
      assertEquals(
        actualDelays.length,
        2,
        'Should have 2 retry delays'
      );
      
      // First delay should be close to retryDelay (allowing 1s variance)
      assertEquals(
        Math.abs(actualDelays[0] - 5) <= 1,
        true,
        `First delay should be ~5s, got ${actualDelays[0]}s`
      );
      
      // Second delay should be exactly retryDelay
      assertEquals(
        actualDelays[1],
        5,
        'Second delay should be exactly 5s'
      );

      // Verify total failure count
      assertEquals(
        getFailureCount(),
        2, // retryLimit
        'Handler should be called 2 times (retryLimit)'
      );
    } finally {
      await worker.stop();
    }
  })
);