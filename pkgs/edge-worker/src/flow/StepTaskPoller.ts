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
  /** Canonical queue name the worker polls */
  queueName: string;
  /** Exact step selector for step-queued flows (#651); undefined in flow mode */
  stepSlug?: string;
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

  constructor(
    private readonly adapter: IPgflowClient<TFlow>,
    private readonly signal: AbortSignal,
    private readonly config: StepTaskPollerConfig,
    workerIdSupplier: Supplier<string>,
    logger: Logger
  ) {
    this.getWorkerId = workerIdSupplier;
    this.logger = logger;
  }

  async poll(limit?: number): Promise<StepTaskWithMessage<TFlow>[]> {
    if (this.isAborted()) {
      this.logger.debug('Polling aborted, returning empty array');
      return [];
    }

    const workerId = this.getWorkerId();
    const queueName = this.config.queueName;
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
      // this poller's queue name — the canonical spelling tasks store — and,
      // for step-queued flows, its exact step selector. Both match the
      // persisted (queue_name, message_id) identity and route (#650, #651).
      const msgIds = messages.map((msg) => msg.msg_id);
      const tasks = await this.adapter.startTasks(
        this.config.flowSlug,
        msgIds,
        workerId,
        queueName,
        this.config.stepSlug
      );

      this.logger.debug(
        `Started ${tasks.length} tasks from ${messages.length} messages`
      );

      // Messages without a claimable task are preserved: they recur after
      // their visibility timeout until an operator handles them. Warn with
      // identifiers (queue, message ids, selected flow and step) only,
      // never message bodies (#650, #651).
      if (tasks.length < messages.length) {
        const claimedIds = new Set(tasks.map((task) => task.msg_id));
        const unmatchedIds = messages
          .filter((msg) => !claimedIds.has(msg.msg_id))
          .map((msg) => msg.msg_id);
        const stepPart = this.config.stepSlug !== undefined
          ? ` step '${this.config.stepSlug}'`
          : '';
        this.logger.warn(
          `Queue '${queueName}': ${unmatchedIds.length} of ${messages.length} message(s) ` +
            `matched no claimable task for flow '${this.config.flowSlug}'${stepPart} ` +
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
