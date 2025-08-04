import type { Queries } from '../core/Queries.js';
import type { ILifecycle, WorkerBootstrap, WorkerRow } from '../core/types.js';
import type { Logger } from '../platform/types.js';
import { States, WorkerState } from '../core/WorkerState.js';
import type { AnyFlow } from '@pgflow/dsl';

export interface FlowLifecycleConfig {
  heartbeatInterval?: number;
}

/**
 * A specialized WorkerLifecycle for Flow-based workers that is aware of the Flow's step types
 */
export class FlowWorkerLifecycle<TFlow extends AnyFlow> implements ILifecycle {
  private workerState: WorkerState;
  private logger: Logger;
  private queries: Queries;
  private workerRow?: WorkerRow;
  private flow: TFlow;
  // TODO: Temporary field for supplier pattern until we refactor initialization
  private _workerId?: string;
  private heartbeatInterval: number;
  private lastHeartbeat = 0;

  constructor(queries: Queries, flow: TFlow, logger: Logger, config?: FlowLifecycleConfig) {
    this.queries = queries;
    this.flow = flow;
    this.logger = logger;
    this.workerState = new WorkerState(logger);
    this.heartbeatInterval = config?.heartbeatInterval ?? 5000;
  }

  async acknowledgeStart(workerBootstrap: WorkerBootstrap): Promise<void> {
    this.workerState.transitionTo(States.Starting);

    // Store workerId for supplier pattern
    this._workerId = workerBootstrap.workerId;

    this.workerRow = await this.queries.onWorkerStarted({
      queueName: this.queueName,
      ...workerBootstrap,
    });

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
    if (!this.workerRow) {
      return;
    }

    const now = Date.now();
    if (now - this.lastHeartbeat >= this.heartbeatInterval) {
      const result = await this.queries.sendHeartbeat(this.workerRow);
      this.logger.debug(result.is_deprecated ? 'DEPRECATED' : 'OK');
      this.lastHeartbeat = now;
      
      if (result.is_deprecated && !this.isDeprecated) {
        this.logger.info('Worker marked for deprecation, transitioning to deprecated state');
        this.transitionToDeprecated();
      }
    }
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

  transitionToDeprecated() {
    this.workerState.transitionTo(States.Deprecated);
  }

  get isDeprecated() {
    return this.workerState.isDeprecated;
  }
}
