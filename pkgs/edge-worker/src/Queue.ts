import type postgres from 'postgres';
import type { Json, MessageRecord } from './types.ts';

export class Queue<MessagePayload extends Json> {
  constructor(private readonly sql: postgres.Sql, readonly queueName: string) {}

  /**
   * Creates a queue if it doesn't exist.
   * If the queue already exists, this method does nothing.
   */
  async safeCreate() {
    return await this.sql`
        select * from pgmq.create(${this.queueName}) 
        where not exists (
          select 1 from pgmq.list_queues() where queue_name = ${this.queueName}
        );
    `;
  }

  /**
   * Drops a queue if it exists.
   * If the queue doesn't exist, this method does nothing.
   */
  async safeDrop() {
    return await this.sql`
        select * from pgmq.drop_queue(${this.queueName})
        where exists (
          select 1 from pgmq.list_queues() where queue_name = ${this.queueName}
        );
    `;
  }

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
      UPDATE ${this.sql('pgmq.q_' + this.queueName)}
      SET vt = (now() + make_interval(secs => ${vtOffsetSeconds}))
      WHERE msg_id = ${msgId}::bigint
      RETURNING *;
    `;
    return records[0];
  }
}
