import type { Flow } from '../../dsl/src/dsl.ts';
import type { EdgeWorkerConfig } from "./EdgeWorker.ts";
import { ExecutionController } from "./ExecutionController.ts";
import { FlowPoller, type FlowPollerConfig } from "./FlowPoller.ts";
import { FlowTaskExecutor } from "./FlowTaskExecutor.ts";
import { PgflowSqlAdapter } from "./PgflowSqlAdapter.ts";
import { Queries } from "./Queries.ts";
import type { FlowTaskRecord } from './types-flow.ts';
import type { IExecutor, Json } from './types.ts';
import { Worker } from './Worker.ts';
import postgres from 'postgres';
import { FlowWorkerLifecycle } from "./FlowWorkerLifecycle.ts";
import { BatchProcessor } from "./BatchProcessor.ts";
import { getLogger } from "./Logger.ts";

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

  // Use provided SQL connection if available, otherwise create one from connection string
  const sql = config.sql || postgres(config.connectionString!, {
    max: config.maxPgConnections,
    prepare: false,
  });

  // Create the pgflow adapter
  const pgflowAdapter = new PgflowSqlAdapter<TRunPayload>(sql);

  // Use flow slug as queue name, or fallback to 'tasks'
  const queueName = flow.flowOptions?.slug || 'tasks';
  logger.debug(`Using queue name: ${queueName}`);

  // Create specialized FlowWorkerLifecycle with the proxied queue and flow
  const queries = new Queries(sql);
  const lifecycle = new FlowWorkerLifecycle<TRunPayload, TSteps>(queries, flow);

  // Create FlowPoller
  const pollerConfig: FlowPollerConfig = {
    batchSize: config.batchSize || 10,
    queueName: flow.flowOptions.slug
  };
  const poller = new FlowPoller<TRunPayload>(pgflowAdapter, abortSignal, pollerConfig);

  // Create executor factory with proper typing
  const executorFactory = (record: FlowTaskRecord<TRunPayload>, signal: AbortSignal): IExecutor => {
    return new FlowTaskExecutor(flow, record, pgflowAdapter, signal);
  };

  // Create ExecutionController
  const executionController = new ExecutionController<FlowTaskRecord<TRunPayload>>(
    executorFactory,
    abortSignal,
    {
      maxConcurrent: config.maxConcurrent || 10,
    }
  );

  // Create BatchProcessor
  const batchProcessor = new BatchProcessor<FlowTaskRecord<TRunPayload>>(
    executionController,
    poller,
    abortSignal
  );

  // Return Worker
  return new Worker(batchProcessor, lifecycle, sql);
}
