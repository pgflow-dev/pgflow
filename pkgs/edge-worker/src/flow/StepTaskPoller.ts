import type { IPgflowClient } from '@pgflow/core';
import type { IPoller, Supplier } from '../core/types.js';
import type { Logger } from '../platform/types.js';
import type { AnyFlow, AllStepInputs } from '@pgflow/dsl';
import type { StepTaskWithMessage } from '../core/context.js';
import type { PgmqMessageRecord } from '../queue/types.js';

export interface StepTaskPollerConfig {
  batchSize: number;
  /** Flow identity used to select claimable tasks */
  flowSlug: string;
  /** Default queue name; the supplier can override it with the polled name */
  queueName: string;
  visibilityTimeout?: number;
  maxPollSeconds?: number;
  pollIntervalMs?: number;
}

/**
 * A two-phase poller that first reads messages, then explicitly starts tasks
 * This eliminates race conditions by separating message polling from task processing
 */
export class StepTaskPoller<TFlow extends AnyFlow>
  implements IPoller<StepTaskWithMessage<TFlow>>
{
  private logger: Logger;
  // TODO: Temporary supplier pattern until we refactor initialization
  // to pass workerId directly to createWorkerFn
  private readonly getWorkerId: Supplier<string>;
  // Queue name supplier defers resolution until after startup, when the
  // queue is known to exist (queues created by older releases may keep a
  // mixed-case spelling; #650)
  private readonly getQueueName: Supplier<string>;

  constructor(
    private readonly adapter: IPgflowClient<TFlow>,
    private readonly signal: AbortSignal,
    private readonly config: StepTaskPollerConfig,
    workerIdSupplier: Supplier<string>,
    logger: Logger,
    queueNameSupplier?: Supplier<string>
  ) {
    this.getWorkerId = workerIdSupplier;
    this.logger = logger;
    this.getQueueName = queueNameSupplier ?? (() => this.config.queueName);
  }

  async poll(limit?: number): Promise<StepTaskWithMessage<TFlow>[]> {
    if (this.isAborted()) {
      this.logger.debug('Polling aborted, returning empty array');
      return [];
    }

    const workerId = this.getWorkerId();
    const queueName = this.getQueueName();
    const batchSize = limit === undefined
      ? this.config.batchSize
      : Math.min(this.config.batchSize, limit);
    this.logger.debug(
      `Two-phase polling for flow tasks with batch size ${batchSize}, maxPollSeconds: ${this.config.maxPollSeconds}, pollIntervalMs: ${this.config.pollIntervalMs}`
    );

    try {
      // Phase 1: Read messages from queue
      const messages = await this.adapter.readMessages(
        queueName,
        this.config.visibilityTimeout ?? 2,
        batchSize,
        this.config.maxPollSeconds,
        this.config.pollIntervalMs
      );

      if (messages.length === 0) {
        this.logger.debug('No messages found in queue');
        return [];
      }

      this.logger.debug(`Found ${messages.length} messages, starting tasks`);

      // Phase 2: Start tasks for the retrieved messages. The claim receives
      // the actual polled queue and matches the persisted
      // (queue_name, message_id) identity (#650).
      const msgIds = messages.map((msg) => msg.msg_id);
      const tasks = await this.adapter.startTasks(
        this.config.flowSlug,
        msgIds,
        workerId,
        queueName
      );

      this.logger.debug(
        `Started ${tasks.length} tasks from ${messages.length} messages`
      );

      // Messages without a claimable task are preserved: they recur after
      // their visibility timeout until an operator handles them. Warn with
      // identifiers only, never message bodies (#650).
      if (tasks.length < messages.length) {
        const claimedIds = new Set(tasks.map((task) => task.msg_id));
        const unmatchedIds = messages
          .filter((msg) => !claimedIds.has(msg.msg_id))
          .map((msg) => msg.msg_id);
        this.logger.warn(
          `Queue '${queueName}': ${unmatchedIds.length} of ${messages.length} message(s) ` +
            `matched no claimable task for flow '${this.config.flowSlug}' ` +
            `(msg_ids: ${unmatchedIds.join(', ')}). ` +
            'Messages are left for their visibility timeout; recurring ids need operator attention.'
        );
      }

      // Create a map of message ID to message for quick lookup
      const messageMap = new Map<string, PgmqMessageRecord<AllStepInputs<TFlow>>>();
      for (const msg of messages) {
        messageMap.set(msg.msg_id, msg as PgmqMessageRecord<AllStepInputs<TFlow>>);
      }

      // Pair each task with its corresponding message
      const taskWithMessages: StepTaskWithMessage<TFlow>[] = tasks
        .map(task => {
          const message = messageMap.get(task.msg_id);
          if (!message) {
            this.logger.error(`No message found for task ${task.run_id}:${task.step_slug} with msg_id ${task.msg_id}`);
            return null;
          }
          return {
            message,
            task,
            msg_id: task.msg_id,
            flowInput: task.flow_input
          };
        })
        .filter((item): item is StepTaskWithMessage<TFlow> => item !== null);

      return taskWithMessages;
    } catch (err: unknown) {
      this.logger.error(`Error in two-phase polling for flow tasks: ${err}`);
      // Rethrow so Worker can distinguish a failed poll (which drives its
      // retry backoff) from an empty successful poll.
      throw err;
    }
  }

  private isAborted(): boolean {
    return this.signal.aborted;
  }
}
