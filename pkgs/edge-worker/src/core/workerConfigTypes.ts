import type postgres from 'postgres';
import type { AnyFlow, ExtractFlowSteps } from '@pgflow/dsl';

/**
 * Fixed retry strategy configuration
 */
export interface FixedRetryConfig {
  /**
   * Use fixed delay between retries
   */
  strategy: 'fixed';

  /**
   * Maximum number of retry attempts
   */
  limit: number;

  /**
   * Fixed delay in seconds between retries
   */
  baseDelay: number;
}

/**
 * Exponential backoff retry strategy configuration
 */
export interface ExponentialRetryConfig {
  /**
   * Use exponential backoff between retries
   */
  strategy: 'exponential';

  /**
   * Maximum number of retry attempts
   */
  limit: number;

  /**
   * Base delay in seconds (initial delay for exponential backoff)
   */
  baseDelay: number;

  /**
   * Maximum delay in seconds for exponential backoff
   * @default 300
   */
  maxDelay?: number;
}

/**
 * Retry configuration for message processing
 */
export type RetryConfig = FixedRetryConfig | ExponentialRetryConfig;

/**
 * Configuration for the queue worker
 */
export type QueueWorkerConfig = {
  /**
   * PostgreSQL connection string.
   * If not provided, it will be read from the EDGE_WORKER_DB_URL environment variable.
   */
  connectionString?: string;

  /**
   * Name of the queue to poll for messages
   * @default 'tasks'
   */
  queueName?: string;

  /**
   * How many tasks are processed at the same time
   * @default 10
   */
  maxConcurrent?: number;

  /**
   * How many connections to the database are opened
   * @default 4
   */
  maxPgConnections?: number;

  /**
   * In-worker polling interval in seconds
   * @default 5
   */
  maxPollSeconds?: number;

  /**
   * In-database polling interval in milliseconds
   * @default 200
   */
  pollIntervalMs?: number;

  /**
   * Retry configuration for failed messages
   */
  retry?: RetryConfig;

  /**
   * How long to wait before retrying a failed job in seconds
   * @deprecated Use retry.baseDelay with retry.strategy = 'fixed' instead
   * @default 5
   */
  retryDelay?: number;

  /**
   * How many times to retry a failed job
   * @deprecated Use retry.limit instead
   * @default 5
   */
  retryLimit?: number;

  /**
   * How long a job is invisible after reading in seconds.
   * If not successful, will reappear after this time.
   * @default 10
   */
  visibilityTimeout?: number;

  /**
   * Batch size for polling messages
   * @default 10
   */
  batchSize?: number;

  /**
   * Optional SQL client instance
   */
  sql?: postgres.Sql;

  /**
   * Environment variables for context
   * @internal
   */
  env?: Record<string, string | undefined>;
};

/**
 * Resolved queue configuration with all defaults applied and deprecated fields excluded
 */
export type ResolvedQueueWorkerConfig = Required<Omit<QueueWorkerConfig, 'retryDelay' | 'retryLimit'>>;

/**
 * Configuration for the flow worker with two-phase polling
 *
 * stepSlug is intentionally absent: a plain Flow keeps its flow-wide call and
 * rejects a supplied step selector. Step-queued flows use StepWorkerConfig.
 */
export type FlowWorkerConfig = {
  /**
   * Exact step selector for withStepQueues() flows (#651).
   * Rejected on plain flows; required on step-queued flows.
   */
  stepSlug?: never;
  /**
   * How many tasks are processed at the same time
   * @default 10
   */
  maxConcurrent?: number;

  /**
   * PostgreSQL connection string.
   * If not provided, it will be read from the EDGE_WORKER_DB_URL environment variable.
   */
  connectionString?: string;

  /**
   * Optional SQL client instance
   */
  sql?: postgres.Sql;

  /**
   * How many connections to the database are opened
   * @default 4
   */
  maxPgConnections?: number;

  /**
   * Batch size for polling messages
   * @default 10
   */
  batchSize?: number;

  /**
   * Visibility timeout for messages in seconds
   * @default 2
   */
  visibilityTimeout?: number;

  /**
   * In-worker polling interval in seconds
   * @default 2
   */
  maxPollSeconds?: number;

  /**
   * In-database polling interval in milliseconds
   * @default 100
   */
  pollIntervalMs?: number;

  /**
   * Environment variables for context
   * @internal
   */
  env?: Record<string, string | undefined>;
};

/**
 * Resolved flow configuration with all defaults applied
 */
export type ResolvedFlowWorkerConfig = Required<
  Omit<FlowWorkerConfig, 'connectionString' | 'env' | 'stepSlug'>
> & {
  connectionString: string | undefined;
  env: Record<string, string | undefined>;
};

/**
 * Configuration for a step worker polling one step of a withStepQueues()
 * flow (#651). stepSlug autocompletes from the wrapped flow's exact step
 * union and is required; unknown values are also rejected at runtime before
 * worker or database startup.
 */
export type StepWorkerConfig<
  TFlow extends AnyFlow = AnyFlow,
  TStepSlug extends Extract<keyof ExtractFlowSteps<TFlow>, string> = Extract<
    keyof ExtractFlowSteps<TFlow>,
    string
  >
> = Omit<FlowWorkerConfig, 'stepSlug'> & {
  /** The step this worker polls and claims (exact slug from the flow) */
  stepSlug: TStepSlug;
};