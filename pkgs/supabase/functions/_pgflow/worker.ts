import { useConnectionPool } from "./useConnectionPool.ts";

export async function startWorker(slug: string) {
  console.log(`WORKER ${slug}: Started`);
  const { queryObject, withPostgres } = await useConnectionPool();

  const queue = await queryObject(`SELECT pgmq.create('yolo');`);

  while (true) {
    const results = await withPostgres(
      async (client) => await client.queryObject(`SELECT now() as time`),
      // await client.queryObject(`SELECT pgmq.read('yolo', 2, 1);`),
    );
    console.log(`WORKER ${slug}: Results`, results);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export async function startWorkers(count: number) {
  const workers = Array.from({ length: count }).map((_, index) => {
    const slug = `worker-${index + 1}`;
    return startWorker(slug);
  });

  return Promise.all(workers);
}
