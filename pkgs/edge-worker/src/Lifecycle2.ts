import { Heartbeat } from './Heartbeat.ts';
import { getLogger } from './Logger.ts';
import type { WorkerBootstrap, WorkerRow } from './types.ts';
import { States, WorkerState } from './WorkerState.ts';
import type { ILifecycleBackendAdapter } from './interfaces/LifecycleBackendAdapter.ts';

/**
 * Unified Lifecycle class that works with any backend adapter
 * This replaces the separate PgmqLifecycle and FlowLifecycle classes
 */
export class Lifecycle {
  private workerState: WorkerState = new WorkerState();
  private heartbeat?: Heartbeat;
  private logger = getLogger('Lifecycle');
  private workerRow?: WorkerRow;
  private resourceName: string;

  constructor(
    private readonly adapter: ILifecycleBackendAdapter,
    resourceName: string
  ) {
    this.resourceName = resourceName;
  }

  async acknowledgeStart(workerBootstrap: WorkerBootstrap): Promise<void> {
    this.workerState.transitionTo(States.Starting);

    this.logger.info(`Preparing for start with resource '${this.resourceName}'...`);
    await this.adapter.prepareForStart({ resourceName: this.resourceName });

    this.workerRow = await this.adapter.onWorkerStarted({
      resourceName: this.resourceName,
      ...workerBootstrap,
    });

    // Create a heartbeat that uses the adapter to send heartbeats
    this.heartbeat = new Heartbeat(5000, {
      sendHeartbeat: async () => {
        if (this.workerRow) {
          await this.adapter.sendHeartbeat(this.workerRow);
        }
      }
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
      // await this.adapter.onWorkerStopped(this.workerRow);

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
    return this.resourceName;
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