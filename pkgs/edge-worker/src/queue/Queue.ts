import type postgres from 'postgres';
import type { PgmqMessageRecord } from './types.ts';
import type { Json } from '../core/types.ts';
import type { Logger } from '../platform/types.ts';

export class Queue<TPayload extends Json> {
  private logger: Logger;

  constructor(
    private readonly sql: postgres.Sql,
    readonly queueName: string,
    logger: Logger
  ) {
    this.logger = logger;
  }

  /**
   * Creates a queue if it doesn't exist.
   * If the queue already exists, this method does nothing.
   */
  async safeCreate() {
    this.logger.debug(`Creating queue '${this.queueName}' if it doesn't exist`);
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
    this.logger.debug(`Dropping queue '${this.queueName}' if it exists`);
    return await this.sql`
        select * from pgmq.drop_queue(${this.queueName})
        where exists (
          select 1 from pgmq.list_queues() where queue_name = ${this.queueName}
        );
    `;
  }

  async archive(msgId: number): Promise<void> {
    this.logger.debug(
      `Archiving message ${msgId} from queue '${this.queueName}'`
    );
    await this.sql`
      SELECT pgmq.archive(queue_name => ${this.queueName}, msg_id => ${msgId}::bigint);
    `;
  }

  async archiveBatch(msgIds: number[]): Promise<void> {
    this.logger.debug(
      `Archiving ${msgIds.length} messages from queue '${this.queueName}'`
    );
    await this.sql`
      SELECT pgmq.archive(queue_name => ${this.queueName}, msg_ids => ${msgIds}::bigint[]);
    `;
  }

  async send(message: TPayload): Promise<void> {
    this.logger.debug(`Sending message to queue '${this.queueName}'`);
    const msgJson = JSON.stringify(message);
    await this.sql`
      SELECT pgmq.send(queue_name => ${this.queueName}, msg => ${msgJson}::jsonb)
    `;
  }

  async readWithPoll(
    batchSize = 20,
    visibilityTimeout = 10,
    maxPollSeconds = 5,
    pollIntervalMs = 200
  ) {
    this.logger.debug(
      `Reading messages from queue '${this.queueName}' with poll`
    );
    return await this.sql<PgmqMessageRecord<TPayload>[]>`
      SELECT *
      FROM pgflow.read_with_poll(
        queue_name => ${this.queueName},
        vt => ${visibilityTimeout},
        qty => ${batchSize},
        max_poll_seconds => ${maxPollSeconds},
        poll_interval_ms => ${pollIntervalMs}
      );
    `;
  }

  /**
   * Sets the visibility timeout of a message to the current time plus the given offset.
   *
   * This is an inlined version of the pgmq.set_vt in order to fix the bug.
   * The original uses now() instead of clock_timestamp() which is problematic in transactions.
   * See more details here: https://github.com/tembo-io/pgmq/issues/367
   *
   * The only change made is now() replaced with clock_timestamp().
   */
  async setVt(
    msgId: number,
    vtOffsetSeconds: number
  ): Promise<PgmqMessageRecord<TPayload>> {
    this.logger.debug(
      `Setting visibility timeout for message ${msgId} to ${vtOffsetSeconds} seconds`
    );
    const records = await this.sql<PgmqMessageRecord<TPayload>[]>`
      UPDATE ${this.sql('pgmq.q_' + this.queueName)}
      SET vt = (clock_timestamp() + make_interval(secs => ${vtOffsetSeconds}))
      WHERE msg_id = ${msgId}::bigint
      RETURNING *;
    `;
    return records[0];
  }
}
