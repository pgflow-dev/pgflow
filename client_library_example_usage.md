# Example usage of client lib

## Assumptions

- We do not care at all about Row Level Security or Policies and rely on users managing them themselves
- We allow everyone to observe a flow run if they know its UUID
- We allow everyone to start any flow if they know its slug
- We are only concerned about run and step-state level changes, so we do not track particular retries in step tasks
- But we are interested about the output of the step_tasks, because the output of a single step task associated with step state is understood to be this step state's output

## Construct a client using Supabase client

```ts
import { createClient } from '@supabase/supabase-js';
import { Client, PostgresChangesAdapter } from '@pgflow/client';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const pgflow = new Client(supabase);
// under the hood it initializes the PostgresChanges adapter, that uses
// postgres_changes realtime subscriptions to track flow runs and step changes
// const adapter = new PostgresChangesAdapter(supabase);
// this is so in future we can augment Client to support also the "broadcast from database" approach
// which uses a dedicated realtime subscription and dedicated db-side events
```

## Start a flow run

```ts
import type AnalyzeWebsite from '../_flows/analyze_website';

// Start the flow, optionally passing a pre-generated UUID
const flowRun = await pgflow.startFlow<typeof AnalyzeWebsite>(
  'analyze_website',
  { url: 'https://supabase.com' }
);
```

> [!NOTE]
> The second argument (run input) should be statically typed based on the flow DSL type provided.

When calling `pgflow.startFlow`, pgflow client does the following:

1. fetches the steps for given `flow_slug`,
   using `supabase.from('pgflow').select('steps').eq('flow_slug', flow_slug)`
   and stores them locally
1. Generates a new run UUID locally
1. Set up subscriptions before the flow starts using this uuid
   - Eliminate race conditions with event delivery
   - Avoid the need for event buffering

The client implementation will:

1. Generate a UUID if not provided
1. Fetch just the flow definition metadata (steps for now only)
1. Set up realtime subscriptions using the provided UUID
1. Start the flow with our predetermined UUID using a new `pgflow.start_flow_with_states` function that:
   - Calls the existing `pgflow.start_flow` function internally
   - Additionally fetches the initial step states in the same transaction
   - Returns both the run and step states in a single response
   - Provides a complete initial state snapshot to prevent missing fast-completing steps
1. Initialize the client state with this complete snapshot before any events arrive

## Inspect current state of flow run (synchronously)

```ts
flowRun.run_id; // => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
flowRun.status; // => 'started'
flowRun.remaining_steps; // => 1
flowRun.started_at; // => timestamp
flowRun.completed_at; // => null
flowRun.failed_at; // => null
flowRun.input; // => { url: 'https://supabase.com' }
flowRun.flow_slug; // => 'analyze_website'
```

## Event Subscription Model

PgFlow uses a clear separation of event types:

- **Run events**: Only emitted on flow run status changes ('completed', 'failed')
- **Step events**: Only emitted on step status changes ('started', 'completed', 'failed')

### Subscribe to flow run events

```ts
// Subscribe to all run events
const unsubscribe = flowRun.on((event) => {
  console.log('Run event:', event);
});

// Subscribe to specific run events
const completedUnsubscribe = flowRun.on('completed', (event) => {
  console.log('Flow completed:', event);
  console.log('Flow output:', event.output);
});

const failedUnsubscribe = flowRun.on('failed', (event) => {
  console.log('Flow failed:', event);
  console.log('Error message:', event.error_message);
});

// Sample event data:
// {
//   run_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
//   flow_slug: 'analyze_website',
//   status: 'completed',
//   started_at: '2023-01-10T12:30:00Z',
//   completed_at: '2023-01-10T12:31:05Z',
//   failed_at: null,
//   input: { url: 'https://supabase.com' },
//   output: { ... },
//   remaining_steps: 0
// }
```

### Subscribe to step events

```ts
// Get a reference to a specific step
const websiteStep = flowRun.step('website');

// Subscribe to all events for this step
const stepUnsubscribe = websiteStep.on((event) => {
  console.log(`Step ${event.step_slug} event:`, event);
});

// Subscribe to specific step events
websiteStep.on('started', (event) => {
  console.log(`Step ${event.step_slug} has started`);
});

websiteStep.on('completed', (event) => {
  console.log(`Step ${event.step_slug} completed with output:`, event.output);
});

websiteStep.on('failed', (event) => {
  console.log(
    `Step ${event.step_slug} failed with error:`,
    event.error_message
  );
});

// Sample step event data:
// {
//   run_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
//   flow_slug: 'analyze_website',
//   step_slug: 'website',
//   status: 'completed',
//   remaining_tasks: 0,
//   remaining_deps: 0,
//   created_at: '2023-01-10T12:30:01Z',
//   started_at: '2023-01-10T12:30:02Z',
//   completed_at: '2023-01-10T12:30:45Z',
//   failed_at: null,
//   output: { url: 'https://supabase.com', title: 'Supabase' },
//   error_message: null
// }
```

> [!NOTE]
> If you want to track multiple steps, you need to subscribe to each step individually:
>
> ```ts
> // Subscribe to multiple steps individually
> const steps = ['website', 'sentiment', 'summary'];
> const unsubscribes = steps.map((slug) =>
>   flowRun
>     .step(slug)
>     .on('completed', (event) =>
>       console.log(`Step ${slug} completed:`, event.output)
>     )
> );
> ```

## Async waiting for status/output

For waiting on status changes, we'll use a simple promise-based approach:

```ts
// Wait for flow run to complete
flowRun.output; // null
const completedRun = await flowRun.waitForStatus('completed');
completedRun.output; // <whole run output json>

// Wait for specific step to complete
const websiteStep = flowRun.step('website');
const completedStep = await websiteStep.waitForStatus('completed');
completedStep.output; // <website step output json>
```

With timeout and cancellation support:

```ts
// Wait with a timeout (throws TimeoutError if not completed within 30 seconds)
const completedRun = await flowRun.waitForStatus('completed', {
  timeoutMs: 30000,
});
const output = completedRun.output;

// Allow cancellation with AbortController
const controller = new AbortController();
const promise = flowRun.waitForStatus('completed', {
  signal: controller.signal,
});
// Later if needed:
controller.abort('User cancelled operation');
```

The waitForStatus method will:

1. Return a Promise that resolves to 'this' (the flowRun or step instance)
2. Allow waiting for any status ('started', 'completed', 'failed')
3. Throw an error if the promise is rejected (timeout or cancellation)
4. Return immediately if the status is already reached

## Error Handling

When a step or flow fails, we properly handle and surface errors:

```ts
// Error handling with try/catch
try {
  // If the flow fails while waiting, this will throw
  const result = await flowRun.waitForStatus('completed');
  console.log('Flow completed successfully:', result.output);
} catch (error) {
  console.error('Flow failed:', error.message);
  // Access error details if available
  console.error('Error details:', error.error_message);
}

// Access error information directly
if (flowRun.status === 'failed') {
  console.error('Flow failed');
}

// Access step error information
const step = flowRun.step('website');
if (step.status === 'failed') {
  console.error(`Step ${step.step_slug} failed:`, step.error_message);
}
```

## Resource Management

The client automatically cleans up resources for terminal states, but you can also manually manage resources:

```ts
// Manually clean up a specific run's subscriptions
flowRun.dispose();

// Or from the client for any run ID
pgflow.dispose(runId);

// Clean up all subscriptions for all runs
pgflow.disposeAll();
```

## Step API

Each step is accessed through the step() method and has a similar API to the flow run:

```ts
const websiteStep = flowRun.step('website');

// Get step state
websiteStep.status; // => 'completed'
websiteStep.output; // => { url: 'https://example.com', title: 'Example Website' }

// Subscribe to step events
websiteStep.on('started', (event) => {
  console.log(`Step ${event.step_slug} is now started`);
});
websiteStep.on('completed', (event) => {
  console.log(`Step ${event.step_slug} is now completed`);
});
websiteStep.on('failed', (event) => {
  console.log(`Step ${event.step_slug} is now failed`);
});

// Wait for step status
const completedStep = await websiteStep.waitForStatus('completed');
```

This approach allows:

1. Type-safe access to steps based on the flow definition
2. Consistent API between flow runs and steps
3. Ability to dynamically iterate through steps if needed
4. Clean separation of concerns between runs and steps

## Type safety

With the flow started with `typeof AnalyzeWebsite` as type argument, we'll provide full type safety:

```ts
// Type-safe step access - only valid step slugs are allowed
const websiteStep = flowRun.step('website'); // OK
const invalidStep = flowRun.step('invalid-step'); // TypeScript Error

// Type-safe step output - automatically inferred from the DSL
const websiteOutput = websiteStep.output; // TypeScript automatically infers StepOutput<typeof AnalyzeWebsite, 'website'>

// Type-safe flow output - automatically inferred from the DSL
const flowOutput = flowRun.output; // TypeScript automatically infers ExtractFlowOutput<typeof AnalyzeWebsite>

// Type-safe event subscriptions
// flowRun only emits events related to the run changes, not the steps
flowRun.on('completed', (event) => {
  // TypeScript knows this is a RunCompletedEvent
  const runOutput = event.output; // Correctly typed as ExtractFlowOutput<typeof AnalyzeWebsite>
});

// Step events are also properly typed
websiteStep.on('completed', (event) => {
  // TypeScript knows this is a StepCompletedEvent for the 'website' step
  const stepOutput = event.output; // Correctly typed as StepOutput<typeof AnalyzeWebsite, 'website'>
});
```

This type safety is implemented by leveraging the DSL's utility types:

- `ExtractFlowInput<TFlow>` for input validation when starting flows
- `ExtractFlowSteps<TFlow>` for validating step slugs
- `StepOutput<TFlow, TStepSlug>` for step output typing
- `ExtractFlowOutput<TFlow>` for flow output typing

The library provides this full type safety from the DSL all the way through to the client API, with no need for manual type annotations.
