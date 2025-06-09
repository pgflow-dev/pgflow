import { Heartbeat } from '../core/Heartbeat.js';
import type { Queries } from '../core/Queries.js';
import type { ILifecycle, WorkerBootstrap, WorkerRow } from '../core/types.js';
import type { Logger } from '../platform/types.js';
import { States, WorkerState } from '../core/WorkerState.js';
import type { AnyFlow } from '@pgflow/dsl';

/**
 * A specialized WorkerLifecycle for Flow-based workers that is aware of the Flow's step types
 */
export class FlowWorkerLifecycle<TFlow extends AnyFlow> implements ILifecycle {
  private workerState: WorkerState;
  private heartbeat?: Heartbeat;
  private logger: Logger;
  private queries: Queries;
  private workerRow?: WorkerRow;
  private flow: TFlow;
  // TODO: Temporary field for supplier pattern until we refactor initialization
  private _workerId?: string;

  constructor(queries: Queries, flow: TFlow, logger: Logger) {
    this.queries = queries;
    this.flow = flow;
    this.logger = logger;
    this.workerState = new WorkerState(logger);
  }

  async acknowledgeStart(workerBootstrap: WorkerBootstrap): Promise<void> {
    this.workerState.transitionTo(States.Starting);

    // Store workerId for supplier pattern
    this._workerId = workerBootstrap.workerId;

    this.workerRow = await this.queries.onWorkerStarted({
      queueName: this.queueName,
      ...workerBootstrap,
    });

    this.heartbeat = new Heartbeat(
      5000,
      this.queries,
      this.workerRow,
      this.logger
    );

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

  get edgeFunctionName() {
    return this.workerRow?.function_name;
  }

  get queueName() {
    return this.flow.slug;
  }

  // TODO: Temporary getter for supplier pattern until we refactor initialization
  get workerId(): string {
    if (!this._workerId) {
      throw new Error('WorkerId accessed before worker startup');
    }
    return this._workerId;
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
