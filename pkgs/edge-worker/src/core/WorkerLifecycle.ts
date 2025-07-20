import type { Queries } from './Queries.js';
import type { Queue } from '../queue/Queue.js';
import type { ILifecycle, Json, WorkerBootstrap, WorkerRow } from './types.js';
import { States, WorkerState } from './WorkerState.js';
import type { Logger } from '../platform/types.js';

export interface LifecycleConfig {
  queueName: string;
  heartbeatInterval?: number;
}

export class WorkerLifecycle<IMessage extends Json> implements ILifecycle {
  private workerState: WorkerState;
  private logger: Logger;
  private queries: Queries;
  private queue: Queue<IMessage>;
  private workerRow?: WorkerRow;
  private heartbeatInterval: number;
  private lastHeartbeat = 0;

  constructor(queries: Queries, queue: Queue<IMessage>, logger: Logger, config?: Partial<LifecycleConfig>) {
    this.queries = queries;
    this.queue = queue;
    this.logger = logger;
    this.workerState = new WorkerState(logger);
    this.heartbeatInterval = config?.heartbeatInterval ?? 5000;
  }

  async acknowledgeStart(workerBootstrap: WorkerBootstrap): Promise<void> {
    this.workerState.transitionTo(States.Starting);

    this.logger.debug(`Ensuring queue '${this.queue.queueName}' exists...`);
    await this.queue.safeCreate();

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

      // TODO: commented out because we can live without this
      //       but it is causing problems with DbHandler - workes does not have
      //       enough time to fire this query before hard-terimnated
      //       We can always check the heartbeat to see if it is still running
      //
      // await this.queries.onWorkerStopped(this.workerRow);

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
    return this.queue.queueName;
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
