import { createClient } from '@supabase/supabase-js';
import { PgflowClient } from '../src/lib/PgflowClient';
import { FlowRunStatus, FlowStepStatus } from '../src/lib/types';
import { Flow } from '@pgflow/dsl';

const TestFlow = new Flow<number>({ slug: 'test_flow' })
  .step({ slug: 'root' }, async (input) => ({
    a_string: 'hello',
    an_array: [1, 2, 3],
    input,
  }))
  .step({ slug: 'node', dependsOn: ['root'] }, async (input) => ({
    a_number: 23,
    an_array: ['1', '2', '3'],
    input,
  }))
  .step({ slug: 'leaf', dependsOn: ['root'] }, async (input) => ({
    a_number: 23,
    an_array: ['1', '2', '3'],
    input,
  }));

// Create example client
const supabaseUrl = 'https://example.supabase.co';
const supabaseKey = 'your-supabase-key';
const supabase = createClient(supabaseUrl, supabaseKey);

// Create PgflowClient instance
const client = new PgflowClient(supabase);

/**
 * Example 1: Start a flow and wait for completion
 */
async function startFlowAndWait() {
  console.log('Starting flow...');

  // Start the flow with specific input - TypeScript will enforce correct input shape
  const run = await client.startFlow<typeof TestFlow>(TestFlow.slug, 23);

  // Wait for the run to reach a terminal state
  console.log('Waiting for flow to complete...');
  const completed = await run.waitForStatus(FlowRunStatus.Completed, {
    timeoutMs: 30000,
  });
  // completed.step('root').output
  // Output is fully typed according to flow definition
  console.log(`Flow completed!`);
  console.log(`Output: ${JSON.stringify(completed.output)}`);

  return completed;
}

/**
 * Example 2: Monitor individual steps
 */
async function monitorSteps() {
  // Start the flow - use Flow type directly rather than typeof
  const run = await client.startFlow<typeof TestFlow>(TestFlow.slug, 23);

  console.log(`Monitoring steps for flow: ${run.run_id}`);

  // Access a specific step - step slug is typed
  const rootStep = run.step('root');

  // Register event handlers with proper typing
  rootStep.on('started', (event) => {
    console.log(`Sentiment analysis started at: ${event.started_at}`);
  });

  rootStep.on('completed', (event) => {
    // Output is typed according to step definition
    // Need to cast the output to the expected type
    console.log(
      `Sentiment score: ${(event.output as { score: number }).score}`
    );
  });

  // Wait for the step to complete
  await rootStep.waitForStatus(FlowStepStatus.Completed, {
    timeoutMs: 20000,
  });

  // Get step state
  console.log(`Step status: ${rootStep.status}`);
  console.log(`Step output: ${JSON.stringify(rootStep.output)}`);

  return run;
}

/**
 * Example 3: Get a previous run
 */
async function getRun(runId: string) {
  console.log(`Looking up run: ${runId}`);

  // Fetch an existing run
  const run = await client.getRun(runId);

  if (!run) {
    console.log(`Run not found: ${runId}`);
    return null;
  }

  console.log(`Found run: ${run.run_id}`);
  console.log(`Status: ${run.status}`);

  // Check all steps
  console.log('Steps:');
  for (const stepSlug of ['website', 'sentiment', 'summary', 'saveToDb']) {
    const step = run.step(stepSlug);
    console.log(`  ${stepSlug}: ${step.status}`);

    if (step.status === FlowStepStatus.Completed) {
      console.log(`    Output: ${JSON.stringify(step.output)}`);
    } else if (step.status === FlowStepStatus.Failed) {
      console.log(`    Error: ${step.error_message}`);
    }
  }

  return run;
}

/**
 * Example 4: Using event listeners and run lifecycle
 */
async function subscribeToRunEvents() {
  // Start the flow
  const run = await client.startFlow(AnalyzeWebsite.slug, {
    url: 'https://example.com/subscribe',
  });

  console.log(`Subscribed to run: ${run.run_id}`);

  // Register global events listener
  run.on('*', (event) => {
    console.log(`Event received: ${event.status}`);
  });

  // Register specific event handlers
  run.on('completed', (event) => {
    console.log(`Run completed at: ${event.completed_at}`);
    console.log(`Output: ${JSON.stringify(event.output)}`);
  });

  run.on('failed', (event) => {
    console.log(`Run failed at: ${event.failed_at}`);
    console.log(`Error: ${event.error_message}`);
  });

  // Wait for completion and then clean up
  await run.waitForStatus(FlowRunStatus.Completed);

  // Dispose the run when done to clean up resources
  run.dispose();

  return run.run_id;
}

/**
 * Main function to run all examples
 */
async function main() {
  try {
    console.log('=== Example 1: Start flow and wait ===');
    const completedRun = await startFlowAndWait();

    console.log('\n=== Example 2: Monitor steps ===');
    await monitorSteps();

    console.log('\n=== Example 3: Get previous run ===');
    await getRun(completedRun.run_id);

    console.log('\n=== Example 4: Subscribe to events ===');
    await subscribeToRunEvents();
  } catch (error) {
    console.error('Error running examples:', error);
  } finally {
    // Clean up all resources
    client.disposeAll();
  }
}

// Only execute if run directly
if (require.main === module) {
  main().catch(console.error);
}

export { startFlowAndWait, monitorSteps, getRun, subscribeToRunEvents };
