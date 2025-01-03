import { type postgres } from "postgres";
import { type Json } from "./types.ts";
import { MessageRecord } from "./Worker.ts";

export class Queue<MessagePayload extends Json> {
  constructor(
    private readonly sql: postgres.Sql,
    private readonly queueName: string,
  ) {}

  async archive(msgId: number): Promise<void> {
    await this.sql`
      SELECT pgmq.archive(${this.queueName}, ${msgId}::bigint);
    `;
  }

  async send(message: MessagePayload): Promise<void> {
    const msgJson = JSON.stringify(message);
    await this.sql`
      SELECT pgmq.send(${this.queueName}, ${msgJson}::jsonb)
    `;
  }

  async readWithPoll(
    batchSize = 20,
    visibilityTimeout = 2,
    maxPollSeconds = 5,
    pollIntervalMs = 200,
  ) {
    return await this.sql<MessageRecord<MessagePayload>[]>`
      SELECT *
      FROM pgmq.read_with_poll(
        queue_name => ${this.queueName},
        vt => ${visibilityTimeout},
        qty => ${batchSize},
        max_poll_seconds => ${maxPollSeconds},
        poll_interval_ms => ${pollIntervalMs}
      );
    `;
  }

  async end() {
    await this.sql.end();
  }
}
