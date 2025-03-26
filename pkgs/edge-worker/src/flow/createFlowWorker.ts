import type { Flow } from '../../../dsl/src/dsl.ts';
import type { EdgeWorkerConfig } from "../EdgeWorker.ts";
import { ExecutionController } from "../core/ExecutionController.ts";
import { StepTaskPoller, type StepTaskPollerConfig } from "./StepTaskPoller.ts";
import { StepTaskExecutor } from "./StepTaskExecutor.ts";
import { PgflowSqlClient } from "../../../core/src/PgflowSqlClient.ts";
import { Queries } from "../core/Queries.ts";
import type { StepTaskRecord } from './types.ts';
import type { IExecutor, Json } from '../core/types.ts';
import { Worker } from '../core/Worker.ts';
import postgres from 'postgres';
import { FlowWorkerLifecycle } from "./FlowWorkerLifecycle.ts";
import { BatchProcessor } from "../core/BatchProcessor.ts";
import { getLogger } from "../core/Logger.ts";

/**
 * Configuration for the flow worker
 */
export type FlowWorkerConfig = EdgeWorkerConfig & {
  maxConcurrent?: number;
  connectionString?: string;
  sql?: postgres.Sql;
  maxPgConnections?: number;
  batchSize?: number;
};

/**
 * Creates a new Worker instance for processing flow tasks.
 *
 * @param flow - The Flow DSL definition
 * @param config - Configuration options for the worker
 * @returns A configured Worker instance ready to be started
 */
export function createFlowWorker<
  TRunPayload extends Json,
  TSteps extends Record<string, Json> = Record<never, never>
>(
  flow: Flow<TRunPayload, TSteps>,
  config: FlowWorkerConfig
): Worker {
  const logger = getLogger('createFlowWorker');

  // Create abort controller for graceful shutdown
  const abortController = new AbortController();
  const abortSignal = abortController.signal;

  if (!config.sql && !config.connectionString) {
    throw new Error("Either 'sql' or 'connectionString' must be provided in FlowWorkerConfig.");
  }

  const sql = config.sql || postgres(config.connectionString!, {
    max: config.maxPgConnections,
    prepare: false,
  });

  // Create the pgflow adapter
  const pgflowAdapter = new PgflowSqlClient<TRunPayload>(sql);

  // Use flow slug as queue name, or fallback to 'tasks'
  const queueName = flow.flowOptions?.slug || 'tasks';
  logger.debug(`Using queue name: ${queueName}`);

  // Create specialized FlowWorkerLifecycle with the proxied queue and flow
  const queries = new Queries(sql);
  const lifecycle = new FlowWorkerLifecycle<TRunPayload, TSteps>(queries, flow);

  // Create StepTaskPoller
  const pollerConfig: StepTaskPollerConfig = {
    batchSize: config.batchSize || 10,
    queueName: flow.flowOptions.slug
  };
  const poller = new StepTaskPoller<TRunPayload>(pgflowAdapter, abortSignal, pollerConfig);

  // Create executor factory with proper typing
  const executorFactory = (record: StepTaskRecord<TRunPayload>, signal: AbortSignal): IExecutor => {
    return new StepTaskExecutor(flow, record, pgflowAdapter, signal);
  };

  // Create ExecutionController
  const executionController = new ExecutionController<StepTaskRecord<TRunPayload>>(
    executorFactory,
    abortSignal,
    {
      maxConcurrent: config.maxConcurrent || 10,
    }
  );

  // Create BatchProcessor
  const batchProcessor = new BatchProcessor<StepTaskRecord<TRunPayload>>(
    executionController,
    poller,
    abortSignal
  );

  // Return Worker
  return new Worker(batchProcessor, lifecycle, sql);
}
