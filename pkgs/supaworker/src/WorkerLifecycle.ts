import { Heartbeat } from './Heartbeat.ts';
import { Logger } from './Logger.ts';
import { Queries } from './Queries.ts';
import { States, WorkerState } from './WorkerState.ts';

export class WorkerLifecycle {
  private workerState: WorkerState = new WorkerState();
  private workerId?: string;
  private heartbeat?: Heartbeat;
  private logger: Logger;
  private queries: Queries;

  constructor(
    private readonly queueName: string,
    queries: Queries,
    logger: Logger
  ) {
    this.queries = queries;
    this.logger = logger;
  }

  async acknowledgeStart(): Promise<string> {
    this.workerState.transitionTo(States.Starting);

    const worker = await this.queries.onWorkerStarted(this.queueName);
    this.workerId = worker.worker_id;
    this.logger.setWorkerId(this.workerId);

    this.heartbeat = new Heartbeat(
      5000,
      this.queries,
      this.workerId,
      this.logger.log.bind(this.logger)
    );

    this.workerState.transitionTo(States.Running);
    this.logger.log('Worker started');

    return this.workerId;
  }

  async acknowledgeStop() {
    this.workerState.transitionTo(States.Stopping);

    if (!this.workerId) {
      throw new Error('Cannot stop worker: workerId not set');
    }

    try {
      this.logger.log('Acknowledging worker stop...');
      this.workerState.transitionTo(States.Stopped);
      await this.queries.onWorkerStopped(this.workerId);
      this.logger.log('Worker stop acknowledged');
    } catch (error) {
      this.logger.log(`Error acknowledging worker stop: ${error}`);
      throw error;
    }
  }

  async sendHeartbeat(edgeFunctionName?: string) {
    await this.heartbeat?.send(edgeFunctionName);
  }

  isRunning(): boolean {
    return this.workerState.isRunning;
  }
}
