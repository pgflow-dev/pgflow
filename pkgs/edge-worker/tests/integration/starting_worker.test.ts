import { Worker } from '../../src/Worker.ts';
import { withTransaction } from "../db.ts";
import { delay } from "@std/async";

Deno.test('Starting worker', withTransaction(async (sql) => {
  const worker = new Worker(console.log, {
    sql,
    maxPollSeconds: 1
  });

  worker.startOnlyOnce({
    edgeFunctionName: 'test',
    // random uuid
    workerId: crypto.randomUUID(),
  });

  await delay(100);

  try {
    const workers = await sql`select * from edge_worker.workers`;

    console.log(workers);
  } finally {
    await worker.stop();
  }
}));

Deno.test('check pgmq version', withTransaction(async (sql) => {
  const result = await sql`
    SELECT extversion 
    FROM pg_extension 
    WHERE extname = 'pgmq'
  `; 
  console.log('pgmq version:', result);
}));
