import { Heartbeat } from './Heartbeat.ts';
import { Logger } from './Logger.ts';
import { Queries } from './Queries.ts';
import { Queue } from './Queue.ts';
import { Json, WorkerBootstrap, WorkerRow } from './types.ts';
import { States, WorkerState } from './WorkerState.ts';

export interface LifecycleConfig {
  queueName: string;
}

export class WorkerLifecycle<MessagePayload extends Json> {
  private workerState: WorkerState = new WorkerState();
  private heartbeat?: Heartbeat;
  private logger: Logger;
  private queries: Queries;
  private queue: Queue<MessagePayload>;
  private workerRow?: WorkerRow;

  constructor(queries: Queries, queue: Queue<MessagePayload>, logger: Logger) {
    this.queries = queries;
    this.logger = logger;
    this.queue = queue;
  }

  async acknowledgeStart(workerBootstrap: WorkerBootstrap): Promise<void> {
    this.workerState.transitionTo(States.Starting);

    this.logger.log(`Ensuring queue '${this.queue.queueName}' exists...`);
    await this.queue.safeCreate();

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

  acknowledgeStop() {
    this.workerState.transitionTo(States.Stopping);

    if (!this.workerRow) {
      throw new Error('Cannot stop worker: workerRow not set');
    }

    try {
      this.logger.log('Acknowledging worker stop...');

      // TODO: commented out because we can live without this
      //       but it is causing problems with DbHandler - workes does not have
      //       enough time to fire this query before hard-terimnated
      //       We can always check the heartbeat to see if it is still running
      //
      // await this.queries.onWorkerStopped(this.workerRow);

      this.workerState.transitionTo(States.Stopped);
      this.logger.log('Worker stop acknowledged');
    } catch (error) {
      this.logger.log(`Error acknowledging worker stop: ${error}`);
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
    await this.heartbeat?.send();
  }

  isRunning(): boolean {
    return this.workerState.isRunning;
  }

  transitionToStopping() {
    this.workerState.transitionTo(States.Stopping);
  }
}
