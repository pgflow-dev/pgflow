import { Json } from "./Flow.ts";
import sql from "../_pgflow/sql.ts"; // sql.listen

function logWorker(scope: string, msg: Json = null) {
  console.log(`[worker] ${scope}`, msg);
}

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

  async function* pollQueue(): AsyncGenerator<Json> {
    try {
      while (true) {
        logWorker("polling", new Date().toISOString());

        const results = await sql`
          SELECT message FROM pgmq.read(${queueName}, ${batchSize}, ${visibilityTimeout});
        `;
        logWorker("readMessages results", results);

        for (const message of results) {
          logWorker("readMessages - message", message);
          yield JSON.parse(message.read);
        }

        // Use interruptible sleep
        await sleep(1000);
      }
    } finally {
      // await cleanup();
    }
  }

  return { pollQueue, interruptPolling: interrupt };
}

export async function startWorker(
  channelName: string,
  handler: (payload: Json) => Promise<void>,
) {
  const { pollQueue, interruptPolling } = createQueueGenerator("pgflow");

  // Start listening for notifications
  sql.listen(channelName, (msg: string) => {
    logWorker("NOTIFY", msg);
    interruptPolling(); // Interrupt the sleep when notification received
  });

  // Start polling
  logWorker("Started Polling");

  for await (const payload of pollQueue()) {
    logWorker("payload", payload);

    await handler(payload);
  }
}
