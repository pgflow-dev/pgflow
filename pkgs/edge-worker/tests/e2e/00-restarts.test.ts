import { withSql } from '../sql.ts';
import { assertGreater } from 'jsr:@std/assert';
import {
  fetchWorkers,
  sendBatch,
  seqLastValue,
  startWorker,
  startWorkersMonitor,
  waitFor,
} from './_helpers.ts';

// ponytail: run before load tests can leave unrelated startup requests in pg_net.
const WORKER_NAME = 'cpu_intensive';
const SEQ_NAME = 'cpu_intensive_test_seq';

// TODO: document relation between CPU clock limit, amount of time to process
//       single message and amount of messages to send
const MESSAGES_TO_SEND = 30;

Deno.test(
  {
    name: 'should spawn next worker when CPU clock limit hits',
    sanitizeOps: false, // Progress bar uses async writes that don't complete before test ends
    sanitizeResources: false,
  },
  async () => {
  await withSql(async (sql) => {
    await sql`CREATE SEQUENCE IF NOT EXISTS ${sql(SEQ_NAME)}`;
    await sql`ALTER SEQUENCE ${sql(SEQ_NAME)} RESTART WITH 1`;
    await sql`
      SELECT * FROM pgmq.drop_queue(${WORKER_NAME})
      WHERE EXISTS (
        SELECT 1 FROM pgmq.list_queues() WHERE queue_name = ${WORKER_NAME}
      )
    `;
    await sql`SELECT pgmq.create(${WORKER_NAME})`;
    await sql`
      DELETE FROM pgflow.workers
      WHERE last_heartbeat_at < NOW() - INTERVAL '6 seconds'
    `;

    // Start monitoring workers and cron for debugging
    const monitor = startWorkersMonitor(WORKER_NAME);

    try {
      await startWorker(WORKER_NAME);

      await sendBatch(MESSAGES_TO_SEND, WORKER_NAME);
      await waitFor(async () => await seqLastValue(SEQ_NAME) >= MESSAGES_TO_SEND, {
        timeoutMs: 35000,
        pollIntervalMs: 300,
        description: `${SEQ_NAME} to reach ${MESSAGES_TO_SEND}`,
      });

      const workers = await fetchWorkers(WORKER_NAME);
      assertGreater(
        workers.length,
        1,
        'expected worker to spawn another but there is only 1 worker'
      );
    } finally {
      await monitor.stop();
    }
  });
});
