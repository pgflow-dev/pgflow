import type { Queries } from '../core/Queries.js';
import type { ILifecycle, WorkerBootstrap, WorkerRow } from '../core/types.js';
import type { Logger } from '../platform/types.js';
import { States, WorkerState } from '../core/WorkerState.js';
import type { AnyFlow } from '@pgflow/dsl';
import { extractFlowShape } from '@pgflow/dsl';
import { FlowShapeMismatchError } from './errors.js';

export interface FlowLifecycleConfig {
  heartbeatInterval?: number;
  ensureCompiledOnStartup?: boolean;
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
  private ensureCompiledOnStartup: boolean;

  constructor(queries: Queries, flow: TFlow, logger: Logger, config?: FlowLifecycleConfig) {
    this.queries = queries;
    this.flow = flow;
    this.logger = logger;
    this.workerState = new WorkerState(logger);
    this.heartbeatInterval = config?.heartbeatInterval ?? 5000;
    this.ensureCompiledOnStartup = config?.ensureCompiledOnStartup ?? true;
  }

  async acknowledgeStart(workerBootstrap: WorkerBootstrap): Promise<void> {
    this.workerState.transitionTo(States.Starting);

    // Store workerId for supplier pattern
    this._workerId = workerBootstrap.workerId;

    // Register this edge function for monitoring by ensure_workers() cron.
    // Must be called early to set last_invoked_at (debounce) before heartbeat timeout.
    await this.queries.trackWorkerFunction(workerBootstrap.edgeFunctionName);

    // Compile/verify flow as part of Starting (before registering worker)
    if (this.ensureCompiledOnStartup) {
      await this.ensureFlowCompiled();
    } else {
      this.logger.info(`Skipping compilation check for flow '${this.flow.slug}' (ensureCompiledOnStartup=false)`);
    }

    // Only register worker after successful compilation
    this.workerRow = await this.queries.onWorkerStarted({
      queueName: this.queueName,
      ...workerBootstrap,
    });

    this.workerState.transitionTo(States.Running);
  }

  private async ensureFlowCompiled(): Promise<void> {
    this.logger.info(`Compiling flow '${this.flow.slug}'...`);

    const shape = extractFlowShape(this.flow);

    const result = await this.queries.ensureFlowCompiled(
      this.flow.slug,
      shape
    );

    if (result.status === 'mismatch') {
      throw new FlowShapeMismatchError(this.flow.slug, result.differences);
    }

    this.logger.info(`Flow '${this.flow.slug}' compilation complete: ${result.status}`);
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
