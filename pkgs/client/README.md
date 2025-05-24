# @pgflow/client

TypeScript client library for interacting with pgflow workflows and observing real-time progress updates.

> [!NOTE]
> This project and all its components are licensed under [Apache 2.0](./LICENSE) license.

## Overview

`@pgflow/client` provides a type-safe client for starting pgflow workflows, monitoring their execution, and handling real-time updates. It integrates seamlessly with Supabase for database operations and real-time subscriptions.

Key features:

- **Type-Safe Workflow Management** - Full TypeScript support with automatic type inference
- **Real-Time Updates** - Live progress monitoring via Supabase broadcasts
- **Event-Driven Architecture** - Subscribe to workflow and step events
- **Resource Management** - Automatic cleanup and disposal of resources
- **Error Handling** - Comprehensive error recovery and retry mechanisms

## Installation

```bash
npm install @pgflow/client @supabase/supabase-js
```

## Quick Start

### Basic Setup

```typescript
import { createClient } from '@supabase/supabase-js';
import { PgflowClient } from '@pgflow/client';

// Initialize Supabase client
const supabase = createClient(
  'https://your-project.supabase.co',
  'your-anon-key'
);

// Create pgflow client
const pgflow = new PgflowClient(supabase);
```

### Start and Monitor a Workflow

```typescript
import { FlowRunStatus } from '@pgflow/client';

// Start a workflow
const run = await pgflow.startFlow('analyze_website', {
  url: 'https://example.com'
});

console.log(`Started workflow: ${run.run_id}`);

// Wait for completion
const completed = await run.waitForStatus(FlowRunStatus.Completed, {
  timeoutMs: 30000
});

console.log('Workflow completed:', completed.output);
```

## Core Concepts

### FlowRun

A `FlowRun` represents a single execution instance of a workflow. It provides methods to monitor progress and interact with individual steps.

```typescript
// Get run status and metadata
console.log(run.status);        // 'started' | 'completed' | 'failed'
console.log(run.flow_slug);     // 'analyze_website'
console.log(run.input);         // Original input data
console.log(run.output);        // Final output (when completed)

// Access individual steps
const step = run.step('website_scraper');
console.log(step.status);       // Step-specific status
console.log(step.output);       // Step output data
```

### FlowStep

Individual steps within a workflow run. Each step has its own status, input, output, and timing information.

```typescript
const step = run.step('sentiment_analysis');

// Step metadata
console.log(step.step_slug);     // 'sentiment_analysis'
console.log(step.status);        // 'created' | 'started' | 'completed' | 'failed'
console.log(step.started_at);    // Timestamp when step started
console.log(step.completed_at);  // Timestamp when step completed
console.log(step.error_message); // Error message if failed
```

## API Reference

### PgflowClient

#### `startFlow<TFlow>(flow_slug, input, run_id?)`

Starts a new workflow execution.

```typescript
const run = await pgflow.startFlow('my_flow', { data: 'input' });

// With custom run ID
const run = await pgflow.startFlow('my_flow', { data: 'input' }, 'custom-id');

// With type safety (requires flow definition)
import { MyFlow } from './flows/my-flow';
const run = await pgflow.startFlow<typeof MyFlow>(MyFlow.slug, { data: 'input' });
```

#### `getRun(run_id)`

Retrieves an existing workflow run.

```typescript
const run = await pgflow.getRun('run-uuid');
if (run) {
  console.log('Found run:', run.status);
} else {
  console.log('Run not found');
}
```

#### `dispose(run_id)` / `disposeAll()`

Clean up resources for specific runs or all runs.

```typescript
// Dispose specific run
pgflow.dispose('run-uuid');

// Dispose all runs
pgflow.disposeAll();
```

### FlowRun Methods

#### `waitForStatus(status, options?)`

Wait for the run to reach a specific status.

```typescript
// Wait for completion
const completed = await run.waitForStatus(FlowRunStatus.Completed);

// With timeout
const completed = await run.waitForStatus(FlowRunStatus.Completed, {
  timeoutMs: 30000
});

// Wait for any terminal status
const terminal = await run.waitForStatus([
  FlowRunStatus.Completed,
  FlowRunStatus.Failed
]);
```

#### Event Subscription

Subscribe to run-level events.

```typescript
// Listen to all events
run.on('*', (event) => {
  console.log('Event:', event.status);
});

// Listen to specific events
run.on('completed', (event) => {
  console.log('Run completed:', event.output);
});

run.on('failed', (event) => {
  console.log('Run failed:', event.error_message);
});

// Unsubscribe
const unsubscribe = run.on('completed', handler);
unsubscribe();
```

### FlowStep Methods

#### `waitForStatus(status, options?)`

Wait for a step to reach a specific status.

```typescript
const step = run.step('data_processing');

// Wait for step completion
await step.waitForStatus(FlowStepStatus.Completed);

// With timeout
await step.waitForStatus(FlowStepStatus.Completed, {
  timeoutMs: 15000
});
```

#### Event Subscription

Subscribe to step-level events.

```typescript
const step = run.step('analysis');

step.on('started', (event) => {
  console.log(`Step started at: ${event.started_at}`);
});

step.on('completed', (event) => {
  console.log(`Step completed:`, event.output);
});

step.on('failed', (event) => {
  console.log(`Step failed: ${event.error_message}`);
});
```

## Type Safety with Flow Definitions

When using with `@pgflow/dsl`, you get full type safety:

```typescript
import { Flow } from '@pgflow/dsl';

// Define your flow
const AnalyzeWebsite = new Flow<{ url: string }>({ slug: 'analyze_website' })
  .step({ slug: 'scrape' }, async (input) => ({ content: 'html...' }))
  .step({ slug: 'analyze' }, async (input) => ({ sentiment: 0.8 }));

// Type-safe client usage
const run = await pgflow.startFlow<typeof AnalyzeWebsite>(
  AnalyzeWebsite.slug,
  { url: 'https://example.com' }  // TypeScript validates this matches Flow input
);

// Typed step access
const scrapeStep = run.step('scrape');  // TypeScript knows this step exists
const analyzeStep = run.step('analyze');

// Typed output access
await run.waitForStatus(FlowRunStatus.Completed);
console.log(run.output);  // TypeScript knows the output structure
```

## Advanced Usage

### Custom Error Handling

```typescript
try {
  const run = await pgflow.startFlow('risky_workflow', { data: 'test' });
  
  // Monitor for failures
  run.on('failed', (event) => {
    console.error('Workflow failed:', event.error_message);
    // Handle failure (retry, alert, etc.)
  });
  
  const result = await run.waitForStatus([
    FlowRunStatus.Completed,
    FlowRunStatus.Failed
  ]);
  
  if (result.status === FlowRunStatus.Failed) {
    throw new Error(`Workflow failed: ${result.error_message}`);
  }
  
} catch (error) {
  console.error('Error managing workflow:', error);
}
```

### Monitoring Multiple Steps

```typescript
const run = await pgflow.startFlow('complex_workflow', { data: 'input' });

// Monitor specific steps in parallel
const steps = ['step1', 'step2', 'step3'];
const stepPromises = steps.map(stepSlug => 
  run.step(stepSlug).waitForStatus(FlowStepStatus.Completed)
);

// Wait for all steps to complete
await Promise.all(stepPromises);
console.log('All monitored steps completed');
```

### Resource Cleanup

```typescript
const run = await pgflow.startFlow('my_workflow', { data: 'input' });

// Auto-cleanup when workflow finishes
run.on('*', (event) => {
  if (['completed', 'failed'].includes(event.status)) {
    pgflow.dispose(run.run_id);
  }
});

// Or cleanup manually after waiting
await run.waitForStatus(FlowRunStatus.Completed);
pgflow.dispose(run.run_id);
```

## Requirements

- **Supabase Project** with pgflow schema installed
- **Real-time enabled** for live updates
- **Proper permissions** for the `pgflow` schema

## Schema Setup

To use the client, your Supabase project needs:

1. **pgflow schema installed** (via `@pgflow/core` migrations)
2. **Schema permissions** for your Supabase roles:

```sql
-- Grant access to pgflow schema
GRANT USAGE ON SCHEMA pgflow TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA pgflow TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA pgflow TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pgflow TO anon, authenticated, service_role;
```

3. **Exposed schema** in your Supabase dashboard (API Settings → Exposed schemas)

## Development

### Building

```bash
nx build client
```

### Testing

```bash
# Unit tests
nx test client

# Integration tests (requires local Supabase)
nx test:integration client
```

### Example Usage

See [examples/basic.ts](./examples/basic.ts) for comprehensive usage examples.

## Related Packages

- [`@pgflow/core`](../core/README.md) - PostgreSQL workflow engine
- [`@pgflow/dsl`](../dsl/README.md) - TypeScript workflow definitions
- [`@pgflow/edge-worker`](../edge-worker/README.md) - Task execution runtime

## Documentation

For more detailed documentation, visit:
- [pgflow Documentation](https://pgflow.dev)
- [Client Library Guide](https://pgflow.dev/how-to/monitor-flow-execution)