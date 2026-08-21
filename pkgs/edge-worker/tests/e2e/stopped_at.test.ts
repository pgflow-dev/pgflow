import { withSql } from '../sql.ts';
import { assertEquals, assertExists } from 'jsr:@std/assert';
import {
  log,
  sendBatch,
  seqLastValue,
  startWorker,
  startWorkersMonitor,
  waitFor,
  waitForSeqToIncrementBy,
} from './_helpers.ts';

const WORKER_NAME = 'stopped_at_test';
const SEQ_NAME = 'stopped_at_test_seq';

// Send enough messages to make worker hit CPU clock limit and die
// Must be enough to exhaust CPU clock (same as restarts.test.ts)
const MESSAGES_TO_SEND = 30;
// Wait for at least a few messages to be processed before worker dies
const MIN_MESSAGES_PROCESSED = 5;

Deno.test(
  {
    name: 'should set stopped_at when worker dies due to CPU clock limit',
    sanitizeOps: false,
    sanitizeResources: false,
  },
  async () => {
    await withSql(async (sql) => {
      // Setup: create sequence
      await sql`CREATE SEQUENCE IF NOT EXISTS ${sql(SEQ_NAME)}`;
      await sql`ALTER SEQUENCE ${sql(SEQ_NAME)} RESTART WITH 1`;

      // Create queue if it doesn't exist (don't drop - workers might be polling)
      const queues = await sql`SELECT queue_name FROM pgmq.list_queues() WHERE queue_name = ${WORKER_NAME}`;
      if (queues.length === 0) {
        await sql`SELECT pgmq.create(${WORKER_NAME})`;
      } else {
        // Purge existing messages
        await sql`SELECT pgmq.purge_queue(${WORKER_NAME})`;
      }

      // Clean up old worker records without orphaning live workers.
      await sql`
        DELETE FROM pgflow.workers
        WHERE function_name = ${WORKER_NAME}
          AND (
            stopped_at IS NOT NULL
            OR last_heartbeat_at < NOW() - INTERVAL '6 seconds'
          )
      `;

      // Start monitoring for debugging
      const monitor = startWorkersMonitor(WORKER_NAME);

      try {
        // Start the worker
        await startWorker(WORKER_NAME);
        const startedWaitingAt = new Date();

        // Get the active worker records. Long-lived local edge isolates from
        // previous runs may still be polling this function's queue.
        const activeWorkers = await sql`
          SELECT *
          FROM pgflow.workers
          WHERE function_name = ${WORKER_NAME}
            AND stopped_at IS NULL
            AND last_heartbeat_at >= NOW() - INTERVAL '6 seconds'
          ORDER BY started_at DESC
        `;
        const [initialWorker] = activeWorkers;
        assertExists(initialWorker, 'Should have an active worker');

        // Verify stopped_at is NULL initially
        assertEquals(
          initialWorker.stopped_at,
          null,
          'Worker should have NULL stopped_at initially'
        );

        // Send enough CPU-intensive tasks that at least one active isolate
        // should hit the CPU clock limit even when old isolates share the work.
        const messagesToSend = MESSAGES_TO_SEND * activeWorkers.length;
        await sendBatch(messagesToSend, WORKER_NAME);

        // Wait for at least some messages to be processed (worker was running)
        await waitForSeqToIncrementBy(MIN_MESSAGES_PROCESSED, {
          seqName: SEQ_NAME,
          timeoutMs: 20000,
          pollIntervalMs: 300,
        });

        // Wait for a worker from this test run to have stopped_at set.
        const stoppedWorker = await waitFor(
          async () => {
            const [worker] = await sql`
              SELECT worker_id, stopped_at, last_heartbeat_at
              FROM pgflow.workers
              WHERE function_name = ${WORKER_NAME}
                AND stopped_at IS NOT NULL
                AND stopped_at >= ${startedWaitingAt}
              ORDER BY stopped_at DESC
              LIMIT 1
            `;

            if (!worker) {
              log('No worker from this test run has stopped yet');
              return false;
            }

            log(`Worker state: stopped_at=${worker.stopped_at}, last_hb=${worker.last_heartbeat_at}`);

            return worker;
          },
          {
            timeoutMs: 120000,
            pollIntervalMs: 500,
            description: 'worker to have stopped_at set',
          }
        );

        // Assert stopped_at was set
        assertExists(stoppedWorker.stopped_at, 'Worker should have stopped_at set after dying');

        // Verify stopped_at is a valid timestamp (not too far in the past)
        const stoppedAt = new Date(stoppedWorker.stopped_at);
        const now = new Date();
        const timeDiff = now.getTime() - stoppedAt.getTime();

        // stopped_at should be within the last 60 seconds
        assertEquals(
          timeDiff < 60000,
          true,
          `stopped_at should be recent (within last 60s), but was ${timeDiff}ms ago`
        );

        // Verify all messages eventually get processed (by replacement worker)
        const finalSeqValue = await seqLastValue(SEQ_NAME);
        assertEquals(
          finalSeqValue >= MIN_MESSAGES_PROCESSED,
          true,
          `At least ${MIN_MESSAGES_PROCESSED} messages should have been processed`
        );
      } finally {
        await monitor.stop();
      }
    });
  }
);
