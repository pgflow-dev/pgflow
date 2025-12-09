import type { Worker } from '../core/Worker.js';

/**
 * Context for task-related log messages
 */
export interface TaskLogContext {
  flowSlug: string;
  stepSlug: string;
  msgId: string;
  runId: string;
  workerId: string;
  workerName: string;
  queueName: string;
  retryAttempt?: number;
  maxRetries?: number;
  /** Base delay in seconds for retry calculation (from step options) */
  baseDelay?: number;
}

/**
 * Context for startup banner log messages (Phase 3b: multi-flow support)
 */
export interface StartupContext {
  workerName: string;
  workerId: string;
  queueName: string;
  flows: Array<{
    flowSlug: string;
    compilationStatus: 'compiled' | 'verified' | 'recompiled' | 'mismatch';
  }>;
}

/**
 * Basic logger interface used throughout the application
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  verbose(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;

  // Structured logging methods
  taskStarted(ctx: TaskLogContext): void;
  taskCompleted(ctx: TaskLogContext, durationMs: number): void;
  taskFailed(ctx: TaskLogContext, error: Error): void;
  // Phase 3b: polling() and taskCount() simplified - no args needed (queue in banner, worker name from factory)
  polling(): void;
  taskCount(count: number): void;
  startupBanner(ctx: StartupContext): void;
  shutdown(phase: 'deprecating' | 'waiting' | 'stopped'): void;
}

/**
 * Logger factory function
 */
export type CreateLoggerFn = (module: string) => Logger;

/**
 * Logger factory function
 */
export type CreateWorkerFn = (createLoggerFn: CreateLoggerFn) => Worker;

/**
 * Common interface for all platform adapters
 * @template TResources - Platform-specific resources type
 */
export interface PlatformAdapter<TResources extends Record<string, unknown> = Record<string, never>> {
  /**
   * startWorker the platform adapter with a worker factory function
   * @param createWorkerFn Function that creates a worker instance when called with a logger
   */
  startWorker(createWorkerFn: CreateWorkerFn): Promise<void>;

  /**
   * Clean up resources when shutting down
   */
  stopWorker(): Promise<void>;

  /**
   * Get the connection string for the database
   * Returns undefined if sql was provided directly via config
   */
  get connectionString(): string | undefined;

  /**
   * Get all environment variables as a record
   */
  get env(): Record<string, string | undefined>;

  /**
   * Get the shutdown signal that fires when the worker is shutting down
   */
  get shutdownSignal(): AbortSignal;

  /**
   * Get platform-specific resources
   */
  get platformResources(): TResources;

  /**
   * Whether running in a local/development environment.
   * Used by flow compilation to determine if recompilation is allowed.
   */
  get isLocalEnvironment(): boolean;

}
