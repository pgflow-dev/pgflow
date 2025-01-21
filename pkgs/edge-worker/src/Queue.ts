import type postgres from 'postgres';
import { type Json } from './types.ts';
import { MessageRecord } from './types.ts';

export class Queue<MessagePayload extends Json> {
  constructor(private readonly sql: postgres.Sql, readonly queueName: string) {}

  async archive(msgId: number): Promise<void> {
    await this.sql`
      SELECT pgmq.archive(queue_name => ${this.queueName}, msg_id => ${msgId}::bigint);
    `;
  }

  async archiveBatch(msgIds: number[]): Promise<void> {
    await this.sql`
      SELECT pgmq.archive(queue_name => ${this.queueName}, msg_ids => ${msgIds}::bigint[]);
    `;
  }

  async send(message: MessagePayload): Promise<void> {
    const msgJson = JSON.stringify(message);
    await this.sql`
      SELECT pgmq.send(queue_name => ${this.queueName}, msg => ${msgJson}::jsonb)
    `;
  }

  async readWithPoll(
    batchSize = 20,
    visibilityTimeout = 2,
    maxPollSeconds = 5,
    pollIntervalMs = 200
  ) {
    return await this.sql<MessageRecord<MessagePayload>[]>`
      SELECT *
      FROM edge_worker.read_with_poll(
        queue_name => ${this.queueName},
        vt => ${visibilityTimeout},
        qty => ${batchSize},
        max_poll_seconds => ${maxPollSeconds},
        poll_interval_ms => ${pollIntervalMs}
      );
    `;
  }

  async setVt(
    msgId: number,
    vtOffsetSeconds: number
  ): Promise<MessageRecord<MessagePayload>> {
    const records = await this.sql<MessageRecord<MessagePayload>[]>`
      SELECT * FROM pgmq.set_vt(
        queue_name => ${this.queueName},
        msg_id => ${msgId}::bigint,
        vt => ${vtOffsetSeconds}::integer
      );
    `;
    return records[0];
  }
}
