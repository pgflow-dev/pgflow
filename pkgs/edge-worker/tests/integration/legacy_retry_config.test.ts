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

/**
 * Test verifies that legacy retryLimit and retryDelay still work (backwards compatibility).
 * Uses dual-source timing validation (JS timestamps + DB visibility times).
 */
Deno.test(
  'queue worker supports legacy retryLimit and retryDelay config',
  withTransaction(async (sql) => {
    // Track warning messages through logger
    const warnMessages: string[] = [];
    const customCreateLogger = (module: string) => ({
      ...createFakeLogger(module),
      warn: (msg: string, _data?: unknown) => {
        log(`WARN: ${msg}`);
        warnMessages.push(msg);
      },
    });

    const spy = createHandlerSpy<Json, MessageHandlerContext>(
      (_input, _context) => {
        log(`Invocation #${spy.count()} at ${new Date().toISOString()}`);
        throw new Error('Intentional failure for legacy config test');
      }
    );

    const worker = createQueueWorker(
      spy.handler,
      {
        sql,
        maxPollSeconds: 1,
        retryLimit: 2, // Legacy config
        retryDelay: 5, // Legacy config
        queueName: 'legacy_retry_test',
      },
      customCreateLogger,
      createTestPlatformAdapter(sql)
    );

    try {
      // Verify deprecation warning was shown
      assertEquals(
        warnMessages.some((msg) =>
          msg.includes('retryLimit and retryDelay are deprecated')
        ),
        true,
        'Should show deprecation warning for legacy config'
      );

      // Start worker and wait for queue to be created
      worker.startOnlyOnce({
        edgeFunctionName: 'legacy-retry-test',
        workerId: crypto.randomUUID(),
      });
      await waitForQueue(sql, 'legacy_retry_test');

      // Send a single message
      const [{ send_batch: msgIds }] = await sendBatch(
        1,
        'legacy_retry_test',
        sql
      );
      log(`Sent message with ID: ${msgIds[0]}`);

      // Wait for all retries to complete
      await waitFor(() => spy.count() >= 2, {
        timeoutMs: 30000,
      });

      // Get delays from both sources
      const jsDelays = calculateJsDelays(spy.invocations);
      const vtDelays = calculateVtDelays(spy.invocations);

      log(`JS delays: ${JSON.stringify(jsDelays)}`);
      log(`VT delays: ${JSON.stringify(vtDelays)}`);

      // Legacy config should result in fixed delays of 5 seconds
      const expectedDelays = [5];

      // Verify JS-based delays match expected pattern (within 200ms tolerance)
      assertDelaysMatch(jsDelays, expectedDelays, 0.2);

      // Verify VT-based delays match expected pattern (within 200ms tolerance)
      assertDelaysMatch(vtDelays, expectedDelays, 0.2);

      // Verify total invocation count
      assertEquals(
        spy.count(),
        2, // retryLimit
        'Handler should be called 2 times (retryLimit)'
      );
    } finally {
      await worker.stop();
    }
  })
);
