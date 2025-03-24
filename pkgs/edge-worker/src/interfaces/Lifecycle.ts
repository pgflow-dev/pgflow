import type { WorkerBootstrap } from '../types.ts';

/**
 * Interface for managing worker lifecycle
 */
export interface Lifecycle {
  /**
   * Acknowledge worker start
   * @param workerBootstrap Worker bootstrap information
   */
  acknowledgeStart(workerBootstrap: WorkerBootstrap): Promise<void>;
  
  /**
   * Acknowledge worker stop
   */
  acknowledgeStop(): void;
  
  /**
   * Send heartbeat to indicate worker is alive
   */
  sendHeartbeat(): Promise<void>;
  
  /**
   * Check if worker is running
   */
  readonly isRunning: boolean;
  
  /**
   * Check if worker is stopping
   */
  readonly isStopping: boolean;
  
  /**
   * Check if worker is stopped
   */
  readonly isStopped: boolean;
  
  /**
   * Get edge function name
   */
  readonly edgeFunctionName?: string;
  
  /**
   * Get queue name
   */
  readonly queueName: string;
  
  /**
   * Transition worker to stopping state
   */
  transitionToStopping(): void;
}