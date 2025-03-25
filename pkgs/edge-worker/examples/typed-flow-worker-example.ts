import { createFlowWorker } from '../src/index.ts';
import { AnalyzeWebsite } from '../../dsl/src/example-flow.ts';
import postgres from 'postgres';

// Example of using the flow worker with proper type inference
const sql = postgres('postgres://user:password@localhost:5432/db');

// The worker is created with proper type inference from the AnalyzeWebsite flow
const worker = createFlowWorker(AnalyzeWebsite, {
  sql,
  maxConcurrent: 5,
  batchSize: 10,
});

// Start the worker
worker.startOnlyOnce({
  edgeFunctionName: 'analyze-website-worker',
  workerId: 'worker-1',
});

// The worker will automatically process tasks for the AnalyzeWebsite flow
// with proper type checking for each step handler
