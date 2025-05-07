# Example usage of client lib

## Assumptions

- we do not care at all about Row Level Security or Policies and rely on users managing them themselves
- we allow everyone to observe a flow run if he knows its UUID
- we allow everyone to start any flow if they know its slug
- we are only concerned about run and step-state level changes, so we do not track particular retries in step tasks
- but we are interested about the output of the step_tasks, because the output of a single step task associated with step state is understood to be this step state's output

## Construct a client using Supabase client

```ts
import { createPgflowClient } from '@pgflow/sdk';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const pgflow = createPgflowClient(supabase);
```

## Start a flow run

```ts
import type AnalyzeWebsite from '../_flows/analyze_website';

const flowRun = pgflow.startFlow<typeof AnalyzeWebsite>('analyze_website', {
  url: 'https://supabase.com',
});
```

> [!NOTE]
> The second argument (run input) should be statically typed based on the flow DSL type provided.

This `startFlow` call should:

- call `supabase.rpc('pgflow.start_flow', { flow_slug, input })`
- establish a realtime broadcast connection on the 'pgflow/runs/<run_id>' channel
  take run id from the return values of supabase.rpc call above
- setup event listeners on realtime channel that will update the locally stored state of the flow run,
  but the updates should be "buffered" so if the updates happen before the fetch below finishes, we need to apply them after it finishes, not before
- fetch the flow run data initially and store it, something like:

  ```ts
  const { data, error } = await supabase
    .schema('pgflow')
    .from('runs')
    .select(
      `
      *,
      flows:pgflow.flows!runs_flow_slug_fkey (
        *,
        steps:pgflow.steps (
          *
        )
      )
      step_states!step_states_run_id_fkey(
        *,
      ),
      step_tasks!step_tasks_run_id_fkey(*)
    `
    )
    .eq('run_id', runId)
    .single<RowTypeAugmentedWithFlowType>();
  ```

  - [x] Decide what shape of data we want to store in the client
    - Private state with public getters for common properties
    - Steps accessible via type-safe method
    - Consistently use snake_case for property names to match Supabase convention

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

- [x] Decide if we want to scope the columns/values in some object and leave top-level values for methods
    - Using direct getters with snake_case names to match Supabase convention

## Event Subscription Model

PgFlow uses a clean separation for event subscriptions:
- Run-level events go only to flowRun subscribers
- Step-level events go only to that specific step's subscribers

### Subscribe to flow run updates

```ts
// Subscribe to run-level status changes only
const unsubscribe = flowRun.subscribe((event) => {
  console.log('Run event:', event);
});

// Received event:
// {
//   run_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
//   flow_slug: 'analyze_website',
//   status: 'started',
//   started_at: '2023-01-10T12:30:00Z',
//   completed_at: null,
//   failed_at: null,
//   input: { url: 'https://supabase.com' },
//   output: null,
//   remaining_steps: 1
// }
```

### Subscribe to step updates

```ts
// Subscribe to a specific step's events
const websiteStep = flowRun.step('website');
const unsubscribeStep = websiteStep.subscribe((event) => {
  console.log(`Step ${event.step_slug} event:`, event);
});

// Received event:
// {
//   run_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
//   flow_slug: 'analyze_website',
//   step_slug: 'website',
//   status: 'started',
//   remaining_tasks: 1,
//   remaining_deps: 0,
//   created_at: '2023-01-10T12:30:01Z',
//   started_at: '2023-01-10T12:30:02Z',
//   completed_at: null,
//   failed_at: null,
//   output: null,
//   error_message: null
// }
```

> [!NOTE]
> If you want to track multiple steps, you need to subscribe to each step individually:
> ```ts
> // Subscribe to multiple steps individually
> const steps = ['website', 'sentiment', 'summary'];
> const unsubscribes = steps.map(slug => 
>   flowRun.step(slug).subscribe(event => console.log(`Step ${slug} event:`, event))
> );
> ```

- [x] Make sure if using the output of step tasks as the output for a step state is a good simplification to make
    - This simplification makes sense since each step has only one task (constraint in database schema)
    - Mapping step_tasks output to step_states makes the API simpler for consumers

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
const completedRun = await flowRun.waitForStatus('completed', { timeoutMs: 30000 });
const output = completedRun.output;

// Allow cancellation with AbortController
const controller = new AbortController();
const promise = flowRun.waitForStatus('completed', { signal: controller.signal });
// Later if needed:
controller.abort('User cancelled operation');
```

The waitForStatus method will:

1. Return a Promise that resolves to 'this' (the flowRun or step instance)
2. Allow waiting for any status ('started', 'completed', 'failed')
3. Throw an error if the promise is rejected (timeout or cancellation)
4. Return immediately if the status is already reached

### Error Handling

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

- [x] Decide if we want to have flow-run-level methods for waiting for steps and run, or we want to introduce a way to "get a step" which will expose the same api for waiting and outputs.
    - We'll use the step() method to get a step object that exposes the same API as the flow run

### Step API

Each step is accessed through the step() method and has a similar API to the flow run:

```ts
const websiteStep = flowRun.step('website');

// Get step state
websiteStep.status; // => 'completed'
websiteStep.output; // => { url: 'https://example.com', title: 'Example Website' }

// Subscribe to step events
websiteStep.subscribe('status', (event) => {
  console.log(`Step ${event.step_slug} is now ${event.status}`);
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

// Type-safe event payloads in subscriptions (using type narrowing)
flowRun.subscribe('status', (event) => {
  if ('step_slug' in event) {
    // TypeScript knows this is a StepEvent
    const stepOutput = event.output; // Correctly typed based on step_slug
  } else {
    // TypeScript knows this is a RunEvent
    const runOutput = event.output; // Correctly typed as flow output
  }
});
```

This type safety is implemented by leveraging the DSL's utility types:
- `ExtractFlowInput<TFlow>` for input validation when starting flows
- `ExtractFlowSteps<TFlow>` for validating step slugs 
- `StepOutput<TFlow, TStepSlug>` for step output typing
- `ExtractFlowOutput<TFlow>` for flow output typing

The library provides this full type safety from the DSL all the way through to the client API, with no need for manual type annotations.
