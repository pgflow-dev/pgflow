import { assertEquals } from '@std/assert';
import { createQueueWorker } from '../../src/queue/createQueueWorker.ts';
import {
  createTestPlatformAdapter,
  createHandlerSpy,
  calculateJsDelays,
  calculateVtDelays,
  assertDelaysMatch,
} from './_helpers.ts';
import { withTransaction } from '../db.ts';
import { createFakeLogger } from '../fakes.ts';
import { log, waitFor } from '../e2e/_helpers.ts';
import { sendBatch, waitForQueue } from '../helpers.ts';
import type { Json } from '../../src/core/types.ts';
import type { MessageHandlerContext } from '../../src/core/context.ts';

const workerConfig = {
  maxPollSeconds: 1,
  retry: {
    strategy: 'fixed' as const,
    limit: 3,
    baseDelay: 3,
  },
  queueName: 'fixed_retry_test',
} as const;

/**
 * Test verifies that fixed retry strategy applies constant delay.
 * Uses dual-source timing validation (JS timestamps + DB visibility times).
 */
Deno.test(
  'queue worker applies fixed delay on retries',
  withTransaction(async (sql) => {
    const spy = createHandlerSpy<Json, MessageHandlerContext>(
      (_input, _context) => {
        log(`Invocation #${spy.count()} at ${new Date().toISOString()}`);
        throw new Error('Intentional failure for fixed retry test');
      }
    );
    const worker = createQueueWorker(
      spy.handler,
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
        edgeFunctionName: 'fixed-retry-test',
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
      await waitFor(() => spy.count() >= workerConfig.retry.limit, {
        timeoutMs: 30000,
      });

      // Get delays from both sources
      const jsDelays = calculateJsDelays(spy.invocations);
      const vtDelays = calculateVtDelays(spy.invocations);

      log(`JS delays: ${JSON.stringify(jsDelays)}`);
      log(`VT delays: ${JSON.stringify(vtDelays)}`);

      // Expected: 2 delays (between invocations 1->2 and 2->3)
      // Each should be approximately baseDelay (3 seconds)
      const expectedDelays = [3, 3];

      // Verify JS-based delays match expected pattern (within 200ms tolerance)
      assertDelaysMatch(jsDelays, expectedDelays, 0.2);

      // Verify VT-based delays match expected pattern (within 200ms tolerance)
      assertDelaysMatch(vtDelays, expectedDelays, 0.2);

      // Verify total invocation count
      assertEquals(
        spy.count(),
        workerConfig.retry.limit,
        `Handler should be called ${workerConfig.retry.limit} times`
      );
    } finally {
      await worker.stop();
    }
  })
);
