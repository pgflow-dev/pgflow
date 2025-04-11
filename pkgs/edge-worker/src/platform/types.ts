import type { Worker } from '../core/Worker.js';
/**
 * Basic logger interface used throughout the application
 */
export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
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
 */
export interface PlatformAdapter {
  /**
   * Initialize the platform adapter with a worker factory function
   * @param createWorkerFn Function that creates a worker instance when called with a logger
   */
  initialize(createWorkerFn: CreateWorkerFn): Promise<void>;

  /**
   * Clean up resources when shutting down
   */
  terminate(): Promise<void>;

  /**
   * Get the connection string for the database
   */
  getConnectionString(): string;
}
