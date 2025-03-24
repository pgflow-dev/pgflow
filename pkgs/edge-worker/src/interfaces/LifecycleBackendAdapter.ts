import type { WorkerBootstrap, WorkerRow } from '../types.ts';

/**
 * Interface for backend adapters that handle lifecycle operations
 * This allows the Lifecycle class to work with different backends (SQL, HTTP, etc.)
 */
export interface ILifecycleBackendAdapter {
  /**
   * Perform any one-time setup or checks needed before the worker can run.
   * For PGMQ, that might be queue creation.
   * For PGFlow, that might be verifying a flow exists.
   */
  prepareForStart(args: { resourceName: string }): Promise<void>;

  /**
   * Register that a worker has started.
   */
  onWorkerStarted(args: {
    resourceName: string;
    workerId: string;
    edgeFunctionName: string;
  }): Promise<WorkerRow>;

  /**
   * Register that a worker has stopped.
   */
  onWorkerStopped(workerRow: WorkerRow): Promise<void>;

  /**
   * Send a heartbeat to keep the worker alive.
   */
  sendHeartbeat(workerRow: WorkerRow): Promise<void>;
}