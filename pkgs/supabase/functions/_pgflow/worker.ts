import { useConnectionPool } from "./useConnectionPool.ts";
import { Json } from "./Flow.ts";
import { listenOnChannel } from "./pubsub.ts";

// Interruptible sleep utility
function createInterruptibleSleep() {
  let resolver: (() => void) | undefined;

  const sleep = (ms: number) => {
    return Promise.race([
      new Promise((resolve) => setTimeout(resolve, ms)),
      new Promise((resolve) => {
        resolver = () => resolve(undefined);
      }),
    ]);
  };

  const interrupt = () => resolver?.();

  return { sleep, interrupt };
}

async function* readMessages(
  queueName: string,
  batchSize = 1,
  visibilityTimeout = 1,
) {
  const { queryArray, pool } = await useConnectionPool();
  const client = await pool.connect();
  const { sleep, interrupt } = createInterruptibleSleep();

  try {
    // Set up notification listener
    const notificationChannel = `${queueName}_notifications`;
    const cleanup = await listenOnChannel(client, notificationChannel, () => {
      // Wake up the sleep when notification arrives
      interrupt();
    });

    try {
      while (true) {
        const results = await queryArray(
          `SELECT pgmq.read('${queueName}', ${batchSize}, ${visibilityTimeout});`,
        );
        const { rows: messages } = results;

        for (const message of messages) {
          console.log("readMessages - message", message);
          yield message;
        }

        // Use interruptible sleep
        await sleep(1000);
      }
    } finally {
      await cleanup();
    }
  } finally {
    client.release();
  }
}

export async function startWorker(
  slug: string,
  handler: (payload: Json) => void,
) {
  console.log(`${slug}: Started`);

  // const { queryObject } = await useConnectionPool();

  for await (const message of readMessages("pgflow_worker")) {
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
