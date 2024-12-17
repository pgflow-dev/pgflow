import sql from "./sql.ts";
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

function createQueueGenerator(
  queueName: string,
  batchSize = 1,
  visibilityTimeout = 1,
) {
  const { sleep, interrupt } = createInterruptibleSleep();

  const channel = `${queueName}_notifications`;
  const listenReq = sql.listen(channel, (msg: string) => {
    console.log("NOTIFY", msg);
    interrupt();
  });

  async function* readMessages() {
    try {
      while (true) {
        console.log("iterated.....", new Date().toISOString());

        // const results = await queryArray(
        //   `SELECT pgmq.read('${queueName}', ${batchSize}, ${visibilityTimeout});`,
        // );
        // const { rows: messages } = results;
        //
        // for (const message of messages) {
        //   console.log("readMessages - message", message);
        //   yield message;
        // }

        // Use interruptible sleep
        await sleep(1000);
      }
    } finally {
      // await cleanup();
    }
  }

  return { readMessages };
}

export async function startWorker(
  slug: string,
  handler: (payload: Json) => void,
) {
  console.log(`${slug}: Started`);

  // const { queryObject } = await useConnectionPool();
  const { readMessages } = createQueueGenerator("pgflow");

  for await (const message of readMessages()) {
    console.log(`${slug}:`, message);
    await handler(message);
  }
}
