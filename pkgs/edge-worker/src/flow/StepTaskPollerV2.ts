import type { StepTaskRecord, IPgflowClient } from './types.js';
import type { IPoller } from '../core/types.js';
import type { Logger } from '../platform/types.js';
import type { AnyFlow } from '@pgflow/dsl';

export interface StepTaskPollerV2Config {
  batchSize: number;
  queueName: string;
  workerId: string;
  visibilityTimeout?: number;
  maxPollSeconds?: number;
  pollIntervalMs?: number;
}

/**
 * A two-phase poller that first reads messages, then explicitly starts tasks
 * This eliminates race conditions by separating message polling from task processing
 */
export class StepTaskPollerV2<TFlow extends AnyFlow>
  implements IPoller<StepTaskRecord<TFlow>>
{
  private logger: Logger;

  constructor(
    private readonly adapter: IPgflowClient<TFlow>,
    private readonly signal: AbortSignal,
    private readonly config: StepTaskPollerV2Config,
    logger: Logger
  ) {
    this.logger = logger;
  }

  async poll(): Promise<StepTaskRecord<TFlow>[]> {
    if (this.isAborted()) {
      this.logger.debug('Polling aborted, returning empty array');
      return [];
    }

    this.logger.debug(
      `Two-phase polling for flow tasks with batch size ${this.config.batchSize}, maxPollSeconds: ${this.config.maxPollSeconds}, pollIntervalMs: ${this.config.pollIntervalMs}`
    );

    try {
      // Phase 1: Read messages from queue
      const messages = await this.adapter.readMessages(
        this.config.queueName,
        this.config.visibilityTimeout ?? 2,
        this.config.batchSize,
        this.config.maxPollSeconds,
        this.config.pollIntervalMs
      );

      if (messages.length === 0) {
        this.logger.debug('No messages found in queue');
        return [];
      }

      this.logger.debug(`Found ${messages.length} messages, starting tasks`);

      // Phase 2: Start tasks for the retrieved messages
      const msgIds = messages.map((msg) => msg.msg_id);
      const tasks = await this.adapter.startTasks(msgIds, this.config.workerId);

      this.logger.debug(`Started ${tasks.length} tasks from ${messages.length} messages`);
      
      // Log if we got fewer tasks than messages (indicates some messages had no matching queued tasks)
      if (tasks.length < messages.length) {
        this.logger.debug(
          `Note: Started ${tasks.length} tasks from ${messages.length} messages. ` +
          `${messages.length - tasks.length} messages had no queued tasks (may retry later).`
        );
      }

      return tasks;
    } catch (err: unknown) {
      this.logger.error(`Error in two-phase polling for flow tasks: ${err}`);
      return [];
    }
  }

  private isAborted(): boolean {
    return this.signal.aborted;
  }
}