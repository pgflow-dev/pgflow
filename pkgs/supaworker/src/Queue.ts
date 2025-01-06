import { postgres } from "../sql.ts";
import { Json } from "../Flow.ts";
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
    batchSize = 10,
    visibilityTimeout = 5,
    maxPollSeconds = 2,
    pollIntervalMs = 100,
  ) {
    return await this.sql<MessageRecord<MessagePayload>[]>`
      SELECT *
      FROM pgmq.read_with_poll(
        ${this.queueName},
        ${batchSize},
        ${visibilityTimeout},
        ${maxPollSeconds},
        ${pollIntervalMs}
      );
    `;
  }

  async end() {
    await this.sql.end();
  }
}
