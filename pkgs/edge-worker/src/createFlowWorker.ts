import type { EdgeWorkerConfig } from "./EdgeWorker.ts";
import { ExecutionController } from "./ExecutionController.ts";
import { Queries } from "./Queries.ts";
import { Queue } from "./Queue.ts";
import type { IExecutor, Json } from './types.ts';
import { Worker } from './Worker.ts';
import postgres from 'postgres';
import { WorkerLifecycle } from "./WorkerLifecycle.ts";
import { BatchProcessor } from "./BatchProcessor.ts";
import { FlowPoller } from "./FlowPoller.ts";
import { FlowTaskExecutor } from "./FlowTaskExecutor.ts";
import type { FlowTaskRecord } from "./FlowTaskRecord.ts";
import type { Flow } from '../dsl/src/dsl.ts';
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
  maxPollSeconds?: number;
  pollIntervalMs?: number;
};

/**
 * Creates a new Worker instance for processing flow tasks.
 *
 * @param flow - The Flow DSL definition containing step handlers
 * @param config - Configuration options for the worker
 * @returns A configured Worker instance ready to be started
 */
export function createFlowWorker<TPayload extends Json>(
  flow: Flow<TPayload>,
  config: FlowWorkerConfig
): Worker {
  const logger = getLogger('createFlowWorker');
  const abortController = new AbortController();
  const abortSignal = abortController.signal;

  // Use provided SQL connection if available, otherwise create one from connection string
  const sql = config.sql || postgres(config.connectionString!, {
    max: config.maxPgConnections,
    prepare: false,
  });

  // Get the flow slug from the flow options or default to 'tasks'
  const queueName = flow.flowOptions?.slug || 'tasks';
  logger.debug(`Creating flow worker for flow '${queueName}'`);

  // Create a real Queue object but we'll proxy it to make safeCreate a no-op
  const realQueue = new Queue<Json>(sql, queueName);

  // Create a proxy around the Queue to make safeCreate a no-op
  const proxiedQueue = new Proxy(realQueue, {
    get(target, propKey, receiver) {
      if (propKey === 'safeCreate') {
        logger.debug(`Intercepted safeCreate call for flow '${queueName}', returning no-op`);
        return async () => {
          logger.debug(`No-op safeCreate for flow '${queueName}'`);
          return [];
        };
      }
      return Reflect.get(target, propKey, receiver);
    }
  });

  const queries = new Queries(sql);
  const lifecycle = new WorkerLifecycle<Json>(queries, proxiedQueue);

  // Create the flow poller
  const flowPoller = new FlowPoller<Json>(
    sql,
    abortSignal,
    {
      batchSize: config.batchSize || config.maxConcurrent || 10,
      maxPollSeconds: config.maxPollSeconds || 5,
      pollIntervalMs: config.pollIntervalMs || 200,
    },
    queueName // Pass the flow slug to the poller
  );

  // Create the executor factory
  const executorFactory = (record: FlowTaskRecord<Json>, signal: AbortSignal): IExecutor => {
    return new FlowTaskExecutor(
      flow,
      record,
      signal,
      sql
    );
  };

  // Create the execution controller
  const executionController = new ExecutionController<FlowTaskRecord<Json>>(
    executorFactory,
    abortSignal,
    {
      maxConcurrent: config.maxConcurrent || 10,
    }
  );

  // Create the batch processor
  const batchProcessor = new BatchProcessor<FlowTaskRecord<Json>>(
    executionController,
    flowPoller,
    abortSignal
  );

  // Return the worker
  return new Worker(batchProcessor, lifecycle, sql);
}