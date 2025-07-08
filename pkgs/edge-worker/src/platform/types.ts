import type { Worker } from '../core/Worker.js';
import type { AnyFlow } from '@pgflow/dsl';
import type { PgmqMessageRecord } from '../queue/types.js';
import type { 
  MessageHandlerContext, 
  StepTaskHandlerContext,
  StepTaskWithMessage 
} from '../core/context.js';

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
 * @template TR - Platform-specific resources type
 */
export interface PlatformAdapter<TR extends object = Record<string, never>> {
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
   */
  get connectionString(): string;

  /**
   * Get all environment variables as a record
   */
  get env(): Record<string, string | undefined>;

  /**
   * Get the shutdown signal that fires when the worker is shutting down
   */
  get shutdownSignal(): AbortSignal;

  /**
   * Create a context for message handlers
   * @param message The pgmq message record
   */
  createMessageContext<TPayload>(
    message: PgmqMessageRecord<TPayload>
  ): MessageHandlerContext<TPayload, TR>;

  /**
   * Create a context for step task handlers
   * @param taskWithMessage The step task with its message
   */
  createStepTaskContext<TFlow extends AnyFlow>(
    taskWithMessage: StepTaskWithMessage<TFlow>
  ): StepTaskHandlerContext<TFlow, TR>;
}
