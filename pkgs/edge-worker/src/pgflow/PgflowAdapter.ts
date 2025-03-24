import type { LifecycleBackendAdapter } from '../interfaces/LifecycleBackendAdapter.ts';
import type { Queries } from '../Queries.ts';
import type { WorkerRow } from '../types.ts';
import type { FlowDefinition } from './types.ts';
import type { Json } from '../types.ts';
import { getLogger } from '../Logger.ts';

/**
 * PGFlow-specific implementation of the lifecycle backend adapter
 */
export class PgflowAdapter<RunPayload extends Json> implements LifecycleBackendAdapter {
  private logger = getLogger('PgflowAdapter');

  constructor(
    private readonly queries: Queries,
    private readonly flow: FlowDefinition<RunPayload>
  ) {}

  async prepareForStart(args: { resourceName: string }): Promise<void> {
    this.logger.info(`Starting worker for flow ${this.flow.flowOptions.slug} on queue ${args.resourceName}`);
    // For pgflow, we might not need to create anything, just verify the flow exists
    // This could be a no-op or a verification step
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