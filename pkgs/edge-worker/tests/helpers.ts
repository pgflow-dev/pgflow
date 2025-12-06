import type { PgmqMessageRecord } from "../src/queue/types.ts";
import type { postgres } from "./sql.ts";
import { waitFor } from "./e2e/_helpers.ts";

/**
 * Waits for a pgmq queue to exist (created by worker startup)
 */
export async function waitForQueue(sql: postgres.Sql, queueName: string) {
  return await waitFor(
    async () => {
      const result = await sql<{ queue_name: string }[]>`
        SELECT queue_name FROM pgmq.list_queues() WHERE queue_name = ${queueName}
      `;
      return result.length > 0 || false;
    },
    {
      description: `queue '${queueName}' to exist`,
      timeoutMs: 5000,
      pollIntervalMs: 50,
    }
  );
}

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

