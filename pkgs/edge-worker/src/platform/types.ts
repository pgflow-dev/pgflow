import type { Worker } from '../core/Worker.js';

/**
 * Basic logger interface used throughout the application
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
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

}
