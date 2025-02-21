import { assertEquals } from "@std/assert";
import { Worker } from '../../src/Worker.ts';
import { withTx } from "../db.ts";
import { delay } from "@std/async";

Deno.test('creates queue when starting worker', withTx(async (sql) => {
  const worker = new Worker(console.log, {
    sql,
    maxPollSeconds: 1,
    queueName: 'custom_queue'
  });

  worker.startOnlyOnce({
    edgeFunctionName: 'test',
    // random uuid
    workerId: crypto.randomUUID(),
  });

  await delay(100);

  try {
    const result: {queue_name: string}[] = await sql`select queue_name from pgmq.list_queues();`;

    assertEquals(
      [...result], 
      [{ queue_name: 'custom_queue' }], 
      'queue "custom_queue" was created'
    );
  } finally {
    await worker.stop();
  }
}));
