import { useConnectionPool } from "./useConnectionPool.ts";
import { Json } from "./Flow.ts";

async function* readMessages(
  queueName: string,
  batchSize = 2,
  visibilityTimeout = 1,
) {
  const { queryArray, withPostgres } = await useConnectionPool();

  while (true) {
    const results = await queryArray(
      `select now() as time from generate_series(1, ${batchSize})`,
      // `SELECT pgmq.read('${queueName}', ${batchSize}, ${visibilityTimeout});`,
    );
    const { rows: messages } = results;
    console.log(`WORKER: Messages`, messages);

    for (const message in messages) {
      yield message;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export async function startWorker(
  slug: string,
  handler: (payload: Json) => void,
) {
  console.log(`${slug}: Started`);
  const { queryObject } = await useConnectionPool();

  await queryObject(`SELECT pgmq.create('pgflow');`);

  for await (const results of readMessages("pgflow")) {
    console.log(`${slug}:`, results);
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
