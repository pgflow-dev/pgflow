import { assertEquals, assertGreaterOrEqual } from '@std/assert';
import { createQueueWorker } from '../../src/queue/createQueueWorker.ts';
import { createTestPlatformAdapter } from './_helpers.ts';
import { withTransaction } from '../db.ts';
import { createFakeLogger } from '../fakes.ts';
import { log, waitFor } from '../e2e/_helpers.ts';
import { getArchivedMessages, sendBatch, waitForQueue } from '../helpers.ts';

const workerConfig = {
  maxPollSeconds: 1,
  retryDelay: 2, // seconds between retries
  retryLimit: 2, // number of retries
  queueName: 'failing_always',
} as const;

/**
 * Creates a handler that always fails and logs elapsed time
 * @param startTime - reference time for elapsed calculations
 */
function createFailingHandler(startTime: number) {
  return function failingHandler() {
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`[elapsed: ${elapsedSec}s] Failed as expected (╯°□°)╯︵ ┻━┻`);
    throw new Error('Intentional failure');
  };
}

/**
 * Test verifies that:
 * 1. Message processing takes at least RETRY_LIMIT * RETRY_DELAY seconds
 * 2. Message is read exactly RETRY_LIMIT + 1 times (initial + retries)
 */
Deno.test(
  'message retry mechanism works correctly',
  withTransaction(async (sql) => {
    const startTime = Date.now();
    const worker = createQueueWorker(
      createFailingHandler(startTime),
      {
        sql,
        ...workerConfig,
      },
      createFakeLogger,
      createTestPlatformAdapter(sql)
    );

    try {
      // Start worker and wait for queue to be created
      worker.startOnlyOnce({
        edgeFunctionName: 'test',
        workerId: crypto.randomUUID(),
      });
      await waitForQueue(sql, workerConfig.queueName);
      await sendBatch(1, workerConfig.queueName, sql);

      // Calculate expected processing time
      const expectedMinimumMs =
        workerConfig.retryLimit * workerConfig.retryDelay * 1000;

      // Wait for message to be archived
      const [message] = await waitFor(
        async () => {
          const messages = await getArchivedMessages(
            sql,
            workerConfig.queueName
          );
          return messages.length >= 1 && messages;
        },
        {
          timeoutMs: expectedMinimumMs + 500,
        }
      );

      // Verify timing
      const totalMs = Date.now() - startTime;
      assertGreaterOrEqual(
        totalMs,
        expectedMinimumMs,
        `Processing time ${totalMs}ms was shorter than minimum ${expectedMinimumMs}ms`
      );

      // Verify retry count
      const expectedReads = workerConfig.retryLimit + 1;
      assertEquals(
        message.read_ct,
        expectedReads,
        `Message should be read ${expectedReads} times (1 initial + ${workerConfig.retryLimit} retries)`
      );
    } finally {
      await worker.stop();
    }
  })
);
