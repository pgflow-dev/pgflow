import type { ILifecycleBackendAdapter } from '../interfaces/LifecycleBackendAdapter.ts';
import type { Queue } from '../Queue.ts';
import type { Queries } from '../Queries.ts';
import type { WorkerRow } from '../types.ts';
import type { Json } from '../types.ts';
import { getLogger } from '../Logger.ts';

/**
 * PGMQ-specific implementation of the lifecycle backend adapter
 */
export class PgmqAdapter<MessagePayload extends Json> implements ILifecycleBackendAdapter {
  private logger = getLogger('PgmqAdapter');

  constructor(
    private readonly queries: Queries,
    private readonly queue: Queue<MessagePayload>
  ) {}

  async prepareForStart(args: { resourceName: string }): Promise<void> {
    this.logger.info(`Ensuring queue '${this.queue.queueName}' exists...`);
    await this.queue.safeCreate();
  }

  async onWorkerStarted(args: {
    resourceName: string;
    workerId: string;
    edgeFunctionName: string;
  }): Promise<WorkerRow> {
    return await this.queries.onWorkerStarted({
      queueName: args.resourceName,
      workerId: args.workerId,
      edgeFunctionName: args.edgeFunctionName,
    });
  }

  async onWorkerStopped(workerRow: WorkerRow): Promise<void> {
    await this.queries.onWorkerStopped(workerRow);
  }

  async sendHeartbeat(workerRow: WorkerRow): Promise<void> {
    await this.queries.sendHeartbeat(workerRow);
  }
}