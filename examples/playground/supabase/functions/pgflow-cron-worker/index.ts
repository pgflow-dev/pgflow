import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import postgres from 'postgres';
import * as internal from '@pgflow/edge-worker/_internal';
import { PgflowSqlClient } from '@pgflow/core';
import type { AnyFlow } from '@pgflow/dsl';

// Import flow definitions
import analyzeWebsiteFlow from '../_flows/analyze_website.ts';

const flows = new Map<string, AnyFlow>([
  ['analyze_website', analyzeWebsiteFlow],
  // Add more flows here as needed
]);

// Initialize all components outside request handler
const loggingFactory = internal.platform.createLoggingFactory();
const workerId = crypto.randomUUID();
loggingFactory.setWorkerId(workerId);

const sql = postgres(Deno.env.get('EDGE_WORKER_DB_URL')!, {
  max: 10, // Reasonable default for cron-based execution
  prepare: false,
});

// Create abort controller without timeout - can be triggered on demand
const abortController = new AbortController();

// Create loggers
const logger = loggingFactory.createLogger('CronWorker');

// Create queries instance for worker management
const queries = new internal.core.Queries(sql);

// Register worker once at startup
const workerRow = await queries.onWorkerStarted({
  queueName: 'analyze_website', // Default queue name
  workerId: workerId,
  edgeFunctionName: 'pgflow-cron-worker',
});

// Create heartbeat instance
const heartbeat = new internal.core.Heartbeat(
  5000, // Send heartbeat every 5 seconds
  queries,
  workerRow,
  loggingFactory.createLogger('Heartbeat'),
);

// Function to process a batch for a specific flow
async function processBatchForFlow<TFlow extends AnyFlow>(
  flowDef: TFlow,
  flow_slug: string,
  batch_size: number,
  max_concurrent: number,
) {
  // Create pgflow SQL client with proper type
  const pgflowClient = new PgflowSqlClient<TFlow>(sql);

  // Create poller for this flow
  const poller = new internal.flow.StepTaskPoller(
    pgflowClient,
    abortController.signal,
    {
      batchSize: batch_size,
      queueName: flow_slug,
      visibilityTimeout: 30,
      maxPollSeconds: 5, // Short poll - no need to match cron interval
      pollIntervalMs: 100, // Fast polling within the 2 seconds
    },
    () => workerId,
    loggingFactory.createLogger('StepTaskPoller'),
  );

  // Create execution controller for this flow
  const executorFactory = (record: any, signal: AbortSignal) =>
    new internal.flow.StepTaskExecutor(
      flowDef,
      record,
      pgflowClient,
      signal,
      loggingFactory.createLogger('StepTaskExecutor'),
    );

  const executionController = new internal.core.ExecutionController(
    executorFactory,
    abortController.signal,
    { maxConcurrent: max_concurrent },
    loggingFactory.createLogger('ExecutionController'),
  );

  // Create and use BatchProcessor for single batch
  const batchProcessor = new internal.core.BatchProcessor(
    executionController,
    poller,
    abortController.signal,
    loggingFactory.createLogger('BatchProcessor'),
  );

  // Process one batch
  const startTime = Date.now();
  logger.info(`Starting batch processing for flow: ${flow_slug}`);

  await batchProcessor.processBatch();

  // Wait for completion
  await executionController.awaitCompletion();

  const duration = Date.now() - startTime;
  logger.info(`Batch processing completed for flow: ${flow_slug}`, {
    duration_ms: duration,
    batch_size,
    max_concurrent,
  });
}

serve(async (req) => {
  try {
    // Send heartbeat
    await heartbeat.send();
    
    const body = await req.json();
    const { flow_slug, batch_size = 10, max_concurrent = 5 } = body;

    if (!flow_slug) {
      return new Response(JSON.stringify({ error: 'flow_slug is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const flow = flows.get(flow_slug);
    if (!flow) {
      return new Response(
        JSON.stringify({ error: `Unknown flow: ${flow_slug}` }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    logger.info(`Processing batch for flow: ${flow_slug}`, {
      batch_size,
      max_concurrent,
    });

    const processingStartTime = Date.now();
    await processBatchForFlow(flow, flow_slug, batch_size, max_concurrent);
    const totalDuration = Date.now() - processingStartTime;

    const response = {
      status: 'completed',
      flow_slug,
      batch_size,
      max_concurrent,
      worker_id: workerId,
      duration_ms: totalDuration,
      timestamp: new Date().toISOString(),
    };

    logger.info('Request completed successfully', response);

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Error processing batch:', error);
    return new Response(
      JSON.stringify({
        status: 'error',
        error: error.message,
        worker_id: workerId,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
});
