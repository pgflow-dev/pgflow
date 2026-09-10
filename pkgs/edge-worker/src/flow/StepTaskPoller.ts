import type { IPgflowClient, ClaimDiagnostic, MessageId } from '@pgflow/core';
import type { IPoller, Supplier } from '../core/types.js';
import type { Logger } from '../platform/types.js';
import type { AnyFlow, AllStepInputs } from '@pgflow/dsl';
import type { StepTaskWithMessage } from '../core/context.js';
import type { PgmqMessageRecord } from '../queue/types.js';
import { FatalWorkerError } from '../core/errors.js';

export interface StepTaskPollerConfig {
  batchSize: number;
  /** Canonical physical queue name: the poller's subscription only. */
  queueName: string;
  /** Exact concrete flow slug: handler identity, kept separate from the queue. */
  flowSlug: string;
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
    const batchSize = limit === undefined
      ? this.config.batchSize
      : Math.min(this.config.batchSize, limit);
    this.logger.debug(
      `Two-phase polling for flow tasks with batch size ${batchSize}, maxPollSeconds: ${this.config.maxPollSeconds}, pollIntervalMs: ${this.config.pollIntervalMs}`
    );

    // Phase 1: Read messages from the queue (own transaction; commits before claim)
    const messages = await this.adapter.readMessages(
      this.config.queueName,
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

    // Phase 2: Claim tasks for the retrieved messages
    const msgIds: MessageId[] = messages.map((msg) => msg.msg_id);
    const result = await this.adapter.startTasks(
      this.config.queueName,
      this.config.flowSlug,
      msgIds,
      workerId
    );

    if (result.status === 'fatal') {
      // The SQL side committed the visibility reset and restart pause; stop
      // the worker without a retry cycle. Ordinary SQL/network exceptions
      // stay ordinary and retryable.
      throw new FatalWorkerError(formatDiagnostics(result.errors));
    }

    // Log only supplied body-free warning diagnostics
    for (const warning of result.warnings) {
      this.logger.warn(formatDiagnostic(warning));
    }

    const tasks = result.tasks;

    this.logger.debug(
      `Started ${tasks.length} tasks from ${messages.length} messages`
    );

    // Create a map of message ID to message for quick lookup
    const messageMap = new Map<MessageId, PgmqMessageRecord<AllStepInputs<TFlow>>>();
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
  }

  private isAborted(): boolean {
    return this.signal.aborted;
  }
}

function formatDiagnostic(diagnostic: ClaimDiagnostic): string {
  return `Claim warning: reason=${diagnostic.reason} queue=${diagnostic.queue_name} message_id=${diagnostic.message_id}`;
}

function formatDiagnostics(diagnostics: ClaimDiagnostic[]): string {
  return [
    'Fatal claim batch: the worker must stop (visibility reset and HTTP restart pause are committed).',
    ...diagnostics.map(formatDiagnostic),
  ].join(' | ');
}
