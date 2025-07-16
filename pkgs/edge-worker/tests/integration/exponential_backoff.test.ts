import { assertEquals } from '@std/assert';
import { createQueueWorker } from '../../src/queue/createQueueWorker.ts';
import { createTestPlatformAdapter } from './_helpers.ts';
import { withTransaction } from '../db.ts';
import { createFakeLogger } from '../fakes.ts';
import { log, waitFor } from '../e2e/_helpers.ts';
import { sendBatch } from '../helpers.ts';
import type { postgres } from '../sql.ts';

const workerConfig = {
  maxPollSeconds: 1,
  retry: {
    strategy: 'exponential' as const,
    limit: 3,
    baseDelay: 2,
  },
  queueName: 'exponential_backoff_test',
} as const;

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
      throw new Error('Intentional failure for exponential backoff test');
    },
    getFailureCount: () => failureTimes.length,
    getFailureTimes: () => failureTimes,
  };
}

/**
 * Test verifies that exponential backoff is applied correctly:
 * - 1st retry: baseDelay * 2^0 = 2 seconds
 * - 2nd retry: baseDelay * 2^1 = 4 seconds
 * - 3rd retry: baseDelay * 2^2 = 8 seconds
 */
Deno.test(
  'queue worker applies exponential backoff on retries',
  withTransaction(async (sql) => {
    const { handler, getFailureCount } = createFailingHandler();
    const worker = createQueueWorker(
      handler,
      {
        sql,
        ...workerConfig,
      },
      createFakeLogger,
      createTestPlatformAdapter(sql)
    );

    try {
      // Start worker and send test message
      worker.startOnlyOnce({
        edgeFunctionName: 'exponential-backoff-test',
        workerId: crypto.randomUUID(),
      });

      // Send a single message
      const [{ send_batch: msgIds }] = await sendBatch(
        1,
        workerConfig.queueName,
        sql
      );
      const msgId = msgIds[0];
      log(`Sent message with ID: ${msgId}`);

      // Collect visibility times after each failure
      const visibilityTimes: number[] = [];

      for (let i = 1; i <= workerConfig.retry.limit; i++) {
        // Wait for failure
        await waitFor(() => getFailureCount() >= i, {
          timeoutMs: 15000,
        });

        // Get visibility time after failure
        const vt = await getMessageVisibilityTime(
          sql,
          workerConfig.queueName,
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

      // Expected exponential backoff pattern: baseDelay * 2^(attempt-1)
      const expectedDelays = [
        2, // First retry: 2 * 2^0 = 2 seconds
        4, // Second retry: 2 * 2^1 = 4 seconds
        8, // Third retry: 2 * 2^2 = 8 seconds
      ];

      // Compare actual vs expected delays
      assertEquals(
        actualDelays,
        expectedDelays,
        'Retry delays should follow exponential backoff pattern'
      );

      // Verify total failure count
      assertEquals(
        getFailureCount(),
        workerConfig.retry.limit,
        `Handler should be called ${workerConfig.retry.limit} times`
      );
    } finally {
      await worker.stop();
    }
  })
);
