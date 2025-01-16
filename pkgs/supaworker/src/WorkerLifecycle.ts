import { Heartbeat } from './Heartbeat.ts';
import { Logger } from './Logger.ts';
import { Queries } from './Queries.ts';
import { WorkerBootstrap, WorkerRow } from './types.ts';
import { States, WorkerState } from './WorkerState.ts';

export interface LifecycleConfig {
  queueName: string;
}

export class WorkerLifecycle {
  private workerState: WorkerState = new WorkerState();
  private heartbeat?: Heartbeat;
  private logger: Logger;
  private queries: Queries;
  private readonly queueName: string;
  private workerRow?: WorkerRow;

  constructor(queries: Queries, logger: Logger, config: LifecycleConfig) {
    this.queries = queries;
    this.logger = logger;
    this.queueName = config.queueName;
  }

  async acknowledgeStart(workerBootstrap: WorkerBootstrap): Promise<void> {
    this.workerState.transitionTo(States.Starting);

    this.workerRow = await this.queries.onWorkerStarted({
      queueName: this.queueName,
      ...workerBootstrap,
    });
    this.logger.setWorkerRow(this.workerRow);

    this.heartbeat = new Heartbeat(
      5000,
      this.queries,
      this.workerRow,
      this.logger.log.bind(this.logger)
    );

    this.workerState.transitionTo(States.Running);
  }

  async acknowledgeStop() {
    this.workerState.transitionTo(States.Stopping);

    if (!this.workerRow) {
      throw new Error('Cannot stop worker: workerRow not set');
    }

    try {
      this.logger.log('Acknowledging worker stop...');
      this.workerState.transitionTo(States.Stopped);
      await this.queries.onWorkerStopped(this.workerRow);
      this.logger.log('Worker stop acknowledged');
    } catch (error) {
      this.logger.log(`Error acknowledging worker stop: ${error}`);
      throw error;
    }
  }

  async sendHeartbeat() {
    await this.heartbeat?.send();
  }

  isRunning(): boolean {
    return this.workerState.isRunning;
  }

  transitionToStopping() {
    this.workerState.transitionTo(States.Stopping);
  }
}
