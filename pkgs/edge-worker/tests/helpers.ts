import type { PgmqMessageRecord } from "../src/queue/types.js";
import type { postgres } from "./sql.js";

export async function sendBatch(count: number, queueName: string, sql: postgres.Sql) {
  return await sql`
    SELECT pgmq.send_batch(
      ${queueName},
      ARRAY(
        SELECT '{}'::jsonb
        FROM generate_series(1, ${count}::integer)
      )
    )`;
}

/**
 * Fetches archived messages from the queue
 */
export async function getArchivedMessages(sql: postgres.Sql, queueName: string) {
  return await sql<PgmqMessageRecord[]>
    `SELECT * FROM ${sql('pgmq.a_' + queueName)}`;
}
