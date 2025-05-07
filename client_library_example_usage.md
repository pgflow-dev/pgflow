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

  - [ ] Decide what shape of data we want to store in the client

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

- [ ] Decide if we want to scope the columns/values in some object and leave top-level values for methods

## Subscribe to flow run updates

```ts
const unsubscribe = flowRun.subscribe('run:*', (event) => {
  console.log(event);
});

// {
//   type: 'run:started',
//   run_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
//   flow_slug: 'analyze_website',
//   status: 'started',
//   started_at: 1673360200,
//   completed_at: null,
//   failed_at: null,
//   input: { url: 'https://supabase.com' },
//   flow_slug: 'analyze_website',
//   remaining_steps: 1,
// }
```

## Subscribe to step updates

```ts
const unsubscribe = flowRun.subscribe('step:*', (event) => {
  console.log(event);
});

// {
//   type: 'step:started',
//   run_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
//   flow_slug: 'analyze_website',
//   step_slug: 'website',
//   status: 'started',
//   remaining_tasks: 1,
//   remaining_deps: 0,
//   created_at: 1673360200,
//   started_at: null,
//   completed_at: null,
//   failed_at: null,
//   output: null, // this will be pulled from step_task with task_index = 0
//   error_message: null, // this will be pulled from step_task with task_index = 0
// }
```

- [ ] Make sure if using the output of step tasks as the output for a step state is a good simplification to make

## Async waiting for status/output

I am not sure how to model the API for the async waiting for particular status/output.
Loose thoughts:

- we never wait for failure, it should be try/catched? or should we wait?
- i imagine we want to wait for step becoming `started`, so waiting should not only be for `completed`
- most of the time the wait is just an easy way of saying "this step is now completed and this are its outputs" or "this step just started"

Ideas for flow waits:

```ts
// can maybe make waitForStatus() to return a promise that resolves to the new state of the run?
flowRun.output; // null
const flowOutput = await flowRun.waitForStatus('completed').output;
flowRun.output; // <whole run output json>, same as flowOutput
```

Ideas for step waits:

```ts
const websiteStep = flowRun.steps.website; // or flowRun.step('website');
const websiteStepOutput = await websiteStep.waitForStatus('completed').output;
websiteStep.output; // <website step output json>, same as websiteStepOutput
```

It might also be useful to support timeouts and cancellation for these waiting operations:

```ts
// Wait with a timeout (throws TimeoutError if not completed within 30 seconds)
const output = await flowRun.waitForStatus('completed', { timeoutMs: 30000 }).output;

// Allow cancellation with AbortController
const controller = new AbortController();
const promise = flowRun.waitForStatus('completed', { signal: controller.signal });
// Later if needed:
controller.abort('User cancelled operation');
```

- [ ] Decide if we want to have flow-run-level methods for waiting for steps and run, or we want to introduce a way to "get a step" which will expose the same api for waiting and outputs. The latter would allow for example to iterate over an array of steps dynamically etc.

### Subscribing to step-events

Maybe it would be a good idea to have a `.subscribe()` method on the value returned by `flowRun.steps.website` (or `.step('website')) - this will make both steps and runs have same api to access output, wait for statuses and subscribe to events, and maybe even simplify the implementation

## Type safety

Given the flow was started with `typeof AnalyzeWebsite` as type argument, we should
statically type:

- available step slugs in `.step(<here>)`
- for given `.step('website')`, we should provide type annotations for its `.output` based on `StepOutput` utility type from DSL
- for whole flow run, we should provide type annotations for `.output` based on `ExtractFlowOutput` utility type from DSL
- in event handlers for `.subscribe()` we should provide type annotations for the event payload based on flow DSL type provided
