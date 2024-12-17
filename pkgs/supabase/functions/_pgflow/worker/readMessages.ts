import sql from "../../_pgflow/sql.ts";
import type { PgmqMessageRecord } from "./index.ts";

export default async function readMessages(
  queueName: string,
  batchSize = 1,
  visibilityTimeout = 1,
) {
  const messages: PgmqMessageRecord[] = (await sql`
    SELECT * FROM pgmq.read(${queueName}, ${batchSize}, ${visibilityTimeout});
  `) as PgmqMessageRecord[];

  console.log("readMessages", messages);

  return messages;
}
