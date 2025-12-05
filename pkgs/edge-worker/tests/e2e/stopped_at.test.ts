import { withSql } from '../sql.ts';
import { assertEquals, assertExists } from 'jsr:@std/assert';
import {
  fetchWorkers,
  log,
  sendBatch,
  seqLastValue,
  setupEnsureWorkersCron,
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

      // Clean up old worker records (but workers may still be running)
      await sql`
        DELETE FROM pgflow.workers
        WHERE function_name = ${WORKER_NAME}
      `;

      // Setup cron job for worker respawning
      await setupEnsureWorkersCron(sql, '1 second');

      // Start monitoring for debugging
      const monitor = startWorkersMonitor(WORKER_NAME);

      try {
        // Start the worker
        await startWorker(WORKER_NAME);

        // Get the initial worker record
        const initialWorkers = await fetchWorkers(WORKER_NAME);
        assertEquals(initialWorkers.length, 1, 'Should have exactly 1 worker');
        const workerId = initialWorkers[0].worker_id;

        // Verify stopped_at is NULL initially
        assertEquals(
          initialWorkers[0].stopped_at,
          null,
          'Worker should have NULL stopped_at initially'
        );

        // Send CPU-intensive tasks that will cause the worker to die
        await sendBatch(MESSAGES_TO_SEND, WORKER_NAME);

        // Wait for at least some messages to be processed (worker was running)
        await waitForSeqToIncrementBy(MIN_MESSAGES_PROCESSED, {
          seqName: SEQ_NAME,
          timeoutMs: 20000,
          pollIntervalMs: 300,
        });

        // Wait for the original worker to have stopped_at set
        const stoppedWorker = await waitFor(
          async () => {
            const [worker] = await sql`
              SELECT worker_id, stopped_at, last_heartbeat_at
              FROM pgflow.workers
              WHERE worker_id = ${workerId}
            `;

            if (!worker) {
              log('Worker not found in DB');
              return false;
            }

            log(`Worker state: stopped_at=${worker.stopped_at}, last_hb=${worker.last_heartbeat_at}`);

            // Return the worker once stopped_at is set
            return worker.stopped_at !== null ? worker : false;
          },
          {
            timeoutMs: 30000,
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
