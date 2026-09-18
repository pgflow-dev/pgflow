import type { Queries } from '../core/Queries.js';
import type { InternalLifecycle, WorkerBootstrap, WorkerRow } from '../core/types.js';
import type { Logger, StartupContext } from '../platform/types.js';
import { States, WorkerState } from '../core/WorkerState.js';
import type { AnyFlow } from '@pgflow/dsl';
import { extractFlowShape } from '@pgflow/dsl';
import { FlowRoutingMismatchError, FlowShapeMismatchError } from './errors.js';
import type { WorkerRouting } from './workerRouting.js';
import { pgflowVersion } from '../core/version.js';

export interface FlowLifecycleConfig {
  heartbeatInterval?: number;
}

/**
 * Compilation status returned by ensureFlowCompiled
 */
type CompilationStatus = 'compiled' | 'verified' | 'recompiled' | 'mismatch';

/**
 * A specialized WorkerLifecycle for Flow-based workers that is aware of the Flow's step types
 */
export class FlowWorkerLifecycle<TFlow extends AnyFlow> implements InternalLifecycle {
  private workerState: WorkerState;
  private logger: Logger;
  private queries: Queries;
  private workerRow?: WorkerRow;
  private flow: TFlow;
  private routing: WorkerRouting;
  // TODO: Temporary field for supplier pattern until we refactor initialization
  private _workerId?: string;
  private _edgeFunctionName?: string;
  private heartbeatInterval: number;
  private lastHeartbeat = 0;

  constructor(
    queries: Queries,
    flow: TFlow,
    routing: WorkerRouting,
    logger: Logger,
    config?: FlowLifecycleConfig
  ) {
    this.queries = queries;
    this.flow = flow;
    this.routing = routing;
    this.logger = logger;
    this.workerState = new WorkerState(logger);
    this.heartbeatInterval = config?.heartbeatInterval ?? 5000;
  }

  async acknowledgeStart(workerBootstrap: WorkerBootstrap): Promise<void> {
    this.workerState.transitionTo(States.Starting);

    // Store workerId and edgeFunctionName for supplier pattern
    this._workerId = workerBootstrap.workerId;
    this._edgeFunctionName = workerBootstrap.edgeFunctionName;

    // Compile/verify the flow before any registration write
    const compilationStatus = await this.ensureFlowCompiled();

    // Register this edge function for monitoring by ensure_workers() cron.
    const startMode = workerBootstrap.startMode ?? 'http';
    await this.queries.trackWorkerFunction(workerBootstrap.edgeFunctionName, startMode);

    // Log startup banner with compilation status
    this.logStartupBanner(compilationStatus);

    this.workerRow = await this.queries.onWorkerStarted({
      queueName: this.queueName,
      ...workerBootstrap,
      pgflowVersion,
    });

    this.workerState.transitionTo(States.Running);
  }

  private async ensureFlowCompiled(): Promise<CompilationStatus> {
    const shape = extractFlowShape(this.flow);

    // Queue mode and the complete ordered route map travel with the shape as
    // independent deployment metadata; SQL derives the authoritative routes
    // and compares the supplied map (#651).
    const result = await this.queries.ensureFlowCompiled(
      this.flow.slug,
      shape,
      this.routing.queueMode,
      this.routing.routes
    );

    if (result.status === 'mismatch') {
      if (result.mismatchKind === 'routing') {
        throw new FlowRoutingMismatchError(this.flow.slug, result.differences);
      }
      throw new FlowShapeMismatchError(this.flow.slug, result.differences);
    }

    return result.status;
  }

  /**
   * Log the startup banner with worker and flow information. A step worker
   * states only its own selected (flow_slug, step_slug, queue_name); it does
   * not claim coverage of other steps' workers (#651).
   */
  private logStartupBanner(compilationStatus: CompilationStatus): void {
    const startupContext: StartupContext = {
      workerName: this._edgeFunctionName ?? 'unknown',
      workerId: this._workerId ?? 'unknown',
      queueName: this.queueName,
      flows: [
        {
          flowSlug: this.flow.slug,
          stepSlug: this.routing.stepSlug,
          compilationStatus,
        },
      ],
    };

    this.logger.startupBanner(startupContext);
  }

  acknowledgeStop() {
    this.workerState.transitionTo(States.Stopping);

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
    return this._edgeFunctionName ?? this.workerRow?.function_name;
  }

  get queueName() {
    // Canonical queue identity from the resolved routing (#650, #651): PGMQ
    // message operations normalize names themselves, so polling and claiming
    // address the queue through the canonical name directly.
    return this.routing.queueName;
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

  get isCreated() {
    return this.workerState.isCreated;
  }

  get isStarting() {
    return this.workerState.isStarting;
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
