import { Heartbeat } from '../Heartbeat.ts';
import { getLogger } from '../Logger.ts';
import type { Queries } from '../Queries.ts';
import type { WorkerBootstrap, WorkerRow } from '../types.ts';
import { States, WorkerState } from '../WorkerState.ts';
import type { Lifecycle } from '../interfaces/Lifecycle.ts';
import type { FlowDefinition } from './types.ts';
import type { Json } from '../types.ts';

/**
 * Implementation of Lifecycle for pgflow
 */
export class FlowLifecycle<RunPayload extends Json> implements Lifecycle {
  private workerState: WorkerState = new WorkerState();
  private heartbeat?: Heartbeat;
  private logger = getLogger('FlowLifecycle');
  private workerRow?: WorkerRow;

  constructor(
    private readonly queries: Queries,
    private readonly flow: FlowDefinition<RunPayload>,
    private readonly queueName: string
  ) {}

  /**
   * Acknowledge worker start
   */
  async acknowledgeStart(workerBootstrap: WorkerBootstrap): Promise<void> {
    this.workerState.transitionTo(States.Starting);

    this.logger.info(`Starting worker for flow ${this.flow.flowOptions.slug} on queue ${this.queueName}`);

    // Register the worker in the database
    this.workerRow = await this.queries.onWorkerStarted({
      queueName: this.queueName,
      ...workerBootstrap,
    });

    this.heartbeat = new Heartbeat(5000, this.queries, this.workerRow);

    this.workerState.transitionTo(States.Running);
  }

  /**
   * Acknowledge worker stop
   */
  acknowledgeStop(): void {
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

  /**
   * Send heartbeat to indicate worker is alive
   */
  async sendHeartbeat(): Promise<void> {
    await this.heartbeat?.send();
  }

  /**
   * Get edge function name
   */
  get edgeFunctionName(): string | undefined {
    return this.workerRow?.function_name;
  }

  /**
   * Get queue name
   */
  get queueName(): string {
    return this.queueName;
  }

  /**
   * Check if worker is running
   */
  get isRunning(): boolean {
    return this.workerState.isRunning;
  }

  /**
   * Check if worker is stopping
   */
  get isStopping(): boolean {
    return this.workerState.isStopping;
  }

  /**
   * Check if worker is stopped
   */
  get isStopped(): boolean {
    return this.workerState.isStopped;
  }

  /**
   * Transition worker to stopping state
   */
  transitionToStopping(): void {
    this.workerState.transitionTo(States.Stopping);
  }
}
