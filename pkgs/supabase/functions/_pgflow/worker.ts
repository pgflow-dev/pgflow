import { Json } from "./Flow.ts";
import sql from "../_pgflow/sql.ts"; // sql.listen
import type { Database } from "../../types.d.ts";
import { type EdgeFnInput as MessagePayload } from "./handleInput.ts";

type PgmqMessageRecord = Database["pgmq"]["CompositeTypes"]["message_record"];

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

  async function* pollQueue(): AsyncGenerator<MessagePayload> {
    try {
      while (true) {
        logWorker("polling", new Date().toISOString());

        const messages: PgmqMessageRecord[] = (await sql`
          SELECT * FROM pgmq.read(${queueName}, ${batchSize}, ${visibilityTimeout});
        `) as PgmqMessageRecord[];
        logWorker("readMessages messages", messages);

        for (const message of messages) {
          logWorker("readMessages - message", message);

          // TODO: can we make it more type safe here?
          const payload = message.message as MessagePayload;
          yield payload;
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

type FindStepTaskInput = {
  run_id: string;
  step_slug: string;
};
type StepTaskRecord =
  Database["pgflow"]["Functions"]["find_step_task"]["Returns"];

async function findStepTask({
  run_id,
  step_slug,
}: FindStepTaskInput): Promise<StepTaskRecord> {
  const results = await sql`
    SELECT * FROM pgflow.find_step_task(${run_id}, ${step_slug});
  `;
  console.log("FIND_STEP_TASK", results);

  const stepTask = results[0] as StepTaskRecord;

  return stepTask;
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

    const stepTask = await findStepTask(payload.meta);

    await handler(payload);
  }
}
