import { Heartbeat } from '../core/Heartbeat.ts';
import { getLogger } from '../core/Logger.ts';
import type { Queries } from '../core/Queries.ts';
import type {
  ILifecycle,
  Json,
  WorkerBootstrap,
  WorkerRow,
} from '../core/types.ts';
import { States, WorkerState } from '../core/WorkerState.ts';
import type { Flow } from '../../../dsl/src/dsl.ts';

/**
 * A specialized WorkerLifecycle for Flow-based workers that is aware of the Flow's step types
 */
export class FlowWorkerLifecycle<
  TRunPayload extends Json,
  TSteps extends Record<string, Json> = Record<never, never>
> implements ILifecycle
{
  private workerState: WorkerState = new WorkerState();
  private heartbeat?: Heartbeat;
  private logger = getLogger('FlowWorkerLifecycle');
  private queries: Queries;
  private workerRow?: WorkerRow;
  private flow: Flow<TRunPayload, TSteps>;

  constructor(queries: Queries, flow: Flow<TRunPayload, TSteps>) {
    this.queries = queries;
    this.flow = flow;
  }

  async acknowledgeStart(workerBootstrap: WorkerBootstrap): Promise<void> {
    this.workerState.transitionTo(States.Starting);

    this.workerRow = await this.queries.onWorkerStarted({
      queueName: this.queueName,
      ...workerBootstrap,
    });

    this.heartbeat = new Heartbeat(5000, this.queries, this.workerRow);

    this.workerState.transitionTo(States.Running);
  }

  acknowledgeStop() {
    this.workerState.transitionTo(States.Stopping);

    if (!this.workerRow) {
      throw new Error('Cannot stop worker: workerRow not set');
    }

    try {
      this.logger.debug('Acknowledging worker stop...');
      this.workerState.transitionTo(States.Stopped);
      this.logger.debug('Worker stop acknowledged');
    } catch (error) {
      this.logger.debug(`Error acknowledging worker stop: ${error}`);
      throw error;
    }
  }

  /**
   * Get the steps defined in this flow with their proper types
   */
  getFlowSteps() {
    return this.flow.getSteps();
  }

  get edgeFunctionName() {
    return this.workerRow?.function_name;
  }

  get queueName() {
    return this.flow.slug;
  }

  async sendHeartbeat() {
    await this.heartbeat?.send();
  }

  get isRunning() {
    return this.workerState.isRunning;
  }

  get isStopping() {
    return this.workerState.isStopping;
  }

  get isStopped() {
    return this.workerState.isStopped;
  }

  transitionToStopping() {
    this.workerState.transitionTo(States.Stopping);
  }
}
