import { useConnectionPool } from "./useConnectionPool.ts";
import { Json } from "./Flow.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function* readMessages(
  queueName: string,
  batchSize = 1,
  visibilityTimeout = 1,
) {
  const { queryArray } = await useConnectionPool();

  while (true) {
    const results = await queryArray(
      // `select now() as time from generate_series(1, ${batchSize})`,
      `SELECT pgmq.read('${queueName}', ${batchSize}, ${visibilityTimeout});`,
    );
    const { rows: messages } = results;
    console.log(`WORKER: Messages`, messages);

    for (const message in messages) {
      console.log("readMessages - message", message);
      yield message;
    }
    await sleep(1000);
  }
}

export async function startWorker(
  slug: string,
  handler: (payload: Json) => void,
) {
  console.log(`${slug}: Started`);
  const { queryObject } = await useConnectionPool();

  // await queryObject(`SELECT pgmq.create('pgflow-worker');`);

  for await (const message of readMessages("pgflow-worker")) {
    console.log(`${slug}:`, message);
    await handler(message);
  }
}

export async function startWorkers(
  count: number,
  handler: (payload: Json) => void,
) {
  const workers = Array.from({ length: count }).map((_, index) => {
    const slug = `worker-${index + 1}`;
    return startWorker(slug, handler);
  });

  return Promise.all(workers);
}
