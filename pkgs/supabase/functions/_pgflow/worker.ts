import { useConnectionPool } from "./useConnectionPool.ts";

async function* readMessages(
  queueName: string,
  batchSize = 2,
  visibilityTimeout = 1,
) {
  const { queryObject, withPostgres } = await useConnectionPool();

  while (true) {
    const results = await queryObject(
      `select now() as time`,
      // `SELECT pgmq.read('${queueName}', ${batchSize}, ${visibilityTimeout});`,
    );
    yield results;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export async function startWorker(slug: string) {
  console.log(`WORKER ${slug}: Started`);
  const { queryObject } = await useConnectionPool();

  await queryObject(`SELECT pgmq.create('yolo');`);

  for await (const results of readMessages("yolo")) {
    console.log(`WORKER ${slug}: Results`, results);
  }
}

export async function startWorkers(count: number) {
  const workers = Array.from({ length: count }).map((_, index) => {
    const slug = `worker-${index + 1}`;
    return startWorker(slug);
  });

  return Promise.all(workers);
}
