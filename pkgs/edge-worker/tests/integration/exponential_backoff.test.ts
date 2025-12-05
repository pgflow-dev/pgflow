import { assertEquals, assertAlmostEquals } from '@std/assert';
import { createQueueWorker } from '../../src/queue/createQueueWorker.ts';
import { createTestPlatformAdapter } from './_helpers.ts';
import { withTransaction } from '../db.ts';
import { createFakeLogger } from '../fakes.ts';
import { log, waitFor } from '../e2e/_helpers.ts';
import { sendBatch, waitForQueue } from '../helpers.ts';
import type { Json } from '../../src/core/types.ts';
import type { MessageHandlerContext } from '../../src/core/context.ts';

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
 * Creates a handler that always fails and collects timing data from two sources:
 * 1. JS timestamps (Date.now()) - when handler is invoked
 * 2. DB visibility times (rawMessage.vt) - when message became visible
 */
function createFailingHandler() {
  const invocations: Array<{ jsTime: number; vt: string }> = [];
  return {
    handler: (_payload: Json, context: MessageHandlerContext) => {
      invocations.push({
        jsTime: Date.now(),
        vt: context.rawMessage.vt,
      });
      log(`Invocation #${invocations.length} at ${new Date().toISOString()}`);
      throw new Error('Intentional failure for exponential backoff test');
    },
    getInvocationCount: () => invocations.length,
    getJsDelays: () => {
      // Delays in seconds from JS timestamps
      const delays: number[] = [];
      for (let i = 1; i < invocations.length; i++) {
        delays.push((invocations[i].jsTime - invocations[i - 1].jsTime) / 1000);
      }
      return delays;
    },
    getVtDelays: () => {
      // Delays in seconds from DB visibility times
      const delays: number[] = [];
      for (let i = 1; i < invocations.length; i++) {
        const vt1 = new Date(invocations[i - 1].vt).getTime();
        const vt2 = new Date(invocations[i].vt).getTime();
        delays.push((vt2 - vt1) / 1000);
      }
      return delays;
    },
  };
}

/**
 * Test verifies that exponential backoff is applied correctly:
 * - 1st retry: baseDelay * 2^0 = 2 seconds
 * - 2nd retry: baseDelay * 2^1 = 4 seconds
 * Uses dual-source timing validation (JS timestamps + DB visibility times).
 */
Deno.test(
  'queue worker applies exponential backoff on retries',
  withTransaction(async (sql) => {
    const { handler, getInvocationCount, getJsDelays, getVtDelays } =
      createFailingHandler();
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
      // Start worker and wait for queue to be created
      worker.startOnlyOnce({
        edgeFunctionName: 'exponential-backoff-test',
        workerId: crypto.randomUUID(),
      });
      await waitForQueue(sql, workerConfig.queueName);

      // Send a single message
      const [{ send_batch: msgIds }] = await sendBatch(
        1,
        workerConfig.queueName,
        sql
      );
      log(`Sent message with ID: ${msgIds[0]}`);

      // Wait for all retries to complete
      await waitFor(() => getInvocationCount() >= workerConfig.retry.limit, {
        timeoutMs: 30000,
      });

      // Get delays from both sources
      const jsDelays = getJsDelays();
      const vtDelays = getVtDelays();

      log(`JS delays: ${JSON.stringify(jsDelays)}`);
      log(`VT delays: ${JSON.stringify(vtDelays)}`);

      // Expected exponential backoff pattern: baseDelay * 2^(attempt-1)
      // - Delay 1->2: 2 * 2^0 = 2 seconds
      // - Delay 2->3: 2 * 2^1 = 4 seconds
      const expectedDelays = [2, 4];

      // Verify JS-based delays match expected pattern (within 200ms tolerance)
      assertEquals(
        jsDelays.length,
        expectedDelays.length,
        `Expected ${expectedDelays.length} delays, got ${jsDelays.length}`
      );
      for (let i = 0; i < expectedDelays.length; i++) {
        assertAlmostEquals(
          jsDelays[i],
          expectedDelays[i],
          0.2,
          `JS delay #${i + 1} should be ~${expectedDelays[i]}s`
        );
      }

      // Verify VT-based delays match expected pattern (within 200ms tolerance)
      assertEquals(
        vtDelays.length,
        expectedDelays.length,
        `Expected ${expectedDelays.length} VT delays, got ${vtDelays.length}`
      );
      for (let i = 0; i < expectedDelays.length; i++) {
        assertAlmostEquals(
          vtDelays[i],
          expectedDelays[i],
          0.2,
          `VT delay #${i + 1} should be ~${expectedDelays[i]}s`
        );
      }

      // Verify total invocation count
      assertEquals(
        getInvocationCount(),
        workerConfig.retry.limit,
        `Handler should be called ${workerConfig.retry.limit} times`
      );
    } finally {
      await worker.stop();
    }
  })
);
