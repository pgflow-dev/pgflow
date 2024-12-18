import sql from "../../_pgflow/sql.ts";
import type { PgmqMessageRecord } from "./index.ts";

export default async function readMessages(
  queueName: string,
  batchSize = 20,
  visibilityTimeout = 1,
) {
  const messages = (await sql`
    SELECT *
    FROM pgmq.read_with_poll(
      ${queueName},
      ${batchSize},
      ${visibilityTimeout},
      ${visibilityTimeout}
    );
  `) as PgmqMessageRecord[];

  console.log("readMessages", messages);

  return messages;
}
