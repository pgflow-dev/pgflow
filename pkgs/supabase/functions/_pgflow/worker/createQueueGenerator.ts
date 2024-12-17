import createInterruptibleSleep from "./createInterruptibleSleep.ts";
import type { Database } from "../../../types.d.ts";
import sql from "../../_pgflow/sql.ts";

export type MessagePayload = {
  run_id: string;
  step_slug: string;
};
export type PgmqMessageRecord =
  Database["pgmq"]["CompositeTypes"]["message_record"];

export default function createQueueGenerator(
  queueName: string,
  batchSize = 1,
  visibilityTimeout = 1,
) {
  const { sleep, interrupt } = createInterruptibleSleep();

  async function* pollQueue(): AsyncGenerator<MessagePayload> {
    try {
      while (true) {
        console.log("polling", new Date().toISOString());

        const messages: PgmqMessageRecord[] = (await sql`
          SELECT * FROM pgmq.read(${queueName}, ${batchSize}, ${visibilityTimeout});
        `) as PgmqMessageRecord[];
        // console.log("readMessages messages", messages);

        for (const message of messages) {
          // console.log("readMessages - message", message);

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
