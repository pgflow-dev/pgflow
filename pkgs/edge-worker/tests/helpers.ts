import type { postgres } from "./sql.ts";

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

