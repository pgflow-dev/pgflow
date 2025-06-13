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
    const { flow_slug, batch_size, max_concurrent, cron_interval_seconds } = body;

    // Validate required parameters
    const missingParams = [];
    if (!flow_slug) missingParams.push('flow_slug');
    if (batch_size === undefined || batch_size === null) missingParams.push('batch_size');
    if (max_concurrent === undefined || max_concurrent === null) missingParams.push('max_concurrent');
    if (cron_interval_seconds === undefined || cron_interval_seconds === null) missingParams.push('cron_interval_seconds');

    if (missingParams.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: `Missing required parameters: ${missingParams.join(', ')}`,
          required_params: ['flow_slug', 'batch_size', 'max_concurrent', 'cron_interval_seconds']
        }), 
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
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
      cron_interval_seconds,
    });

    const processingStartTime = Date.now();
    const maxExecutionTime = (cron_interval_seconds - 1) * 1000; // Leave 1 second buffer
    const maxIterations = cron_interval_seconds * 2; // Safety limit
    
    let iterations = 0;
    let totalProcessed = 0;

    // Keep processing batches until we're close to the next cron invocation
    while (
      Date.now() - processingStartTime < maxExecutionTime &&
      iterations < maxIterations
    ) {
      iterations++;
      
      logger.info(`Starting batch iteration ${iterations}`);
      
      // Send heartbeat before each batch
      await heartbeat.send();
      
      await processBatchForFlow(flow, flow_slug, batch_size, max_concurrent);
      totalProcessed++;
      
      // Small delay to prevent tight loop if no tasks available
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const totalDuration = Date.now() - processingStartTime;

    const response = {
      status: 'completed',
      flow_slug,
      batch_size,
      max_concurrent,
      cron_interval_seconds,
      worker_id: workerId,
      duration_ms: totalDuration,
      iterations: totalProcessed,
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
