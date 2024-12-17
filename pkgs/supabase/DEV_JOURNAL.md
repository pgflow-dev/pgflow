# Dev Journal

This is a journal of development notes and thoughts for pgflow.

## 2024-12-16

First day in Reza - my coding reatreat to finish and release pgflow.

### [x] Implement **retry_stale_step_tasks**

Some HTTP calls to edgefn can fail, so tasks can get stuck in queued state.

- implemented retry_stale_step_tasks() which just finds this kind of tasks and re-enqueues them (calls http again)
- decided to not split retry attempts with re-enqueue attempts - edgefn failing to start a task is a task failure for now for simplicity
- decided to not implement timeouts for edgefn worker - there is natural time limit to how long edgefn can run (150s free, 400s paid tier)
- dead letter queue is just one `select from step_tasks where attempt_count >= max_attempts` away

### [x] Small changes to pgflow_tests

I just removed mocks for start_step - we only ever need call_edgefn mocks for now.
I was considering writing tests in heavy-mock style but given the mocks are super
unwieldy to use (it is just a function that redefines other function),
i decided to use them only to prevent http calls in the tests

### [x] Decided on migration/CLI strategy

I evaluated following tools for managing SQL migrations:

- pgroll - not really helping
- migra - 2y without a commit :-(, otherwise very good
- pgdiff - similar to migra, but seems not very active
- pgrebase - not very active, does not allow generating diff as migration
- tern/dbmate/pgmigrate/graphile-migrate/liquibase/flyway - all based on the versioned approach
- squitch - weird versioning approach
- ariga/atlas - perfect tool for the job, supports hybrid declarative+versioning approach, but paid

I decided to go with Atlas, its perfect and checks all the boxes.
9$ per month for a single user, but there is some kind of Hacker License for OSS maintainers,
which i will try to get.

CI/CD runs for free with a paid account.

## 2024-12-17

### [ ] Implement **pgmq** queue

I started to implement pgmq queue because i had troubles with the retries logic for pgflow-3 implementation.
The main trouble is that running a flow with lot of root steps is slow becuase each root step is a http call to edgefn.

#### Notes from a walk

- enqueue_step_task() is the only function that is called from DB and must be polymorphically dispatched (if multiple backends)
- this function just puts the payload into the queue, the same payload that would be sent via http to edgefn
- all other \*\_step_task() functions are backend-specific and can live in separate namespace and JS handlers can call them from that schema
- i plan to implement pgmq worker in pgflow_pgmq schema
- need a pgflow_pgmq.read_queued_step_tasks(batchSize) function that will read n-messages from the queue
- this function needs to find the related step tasks and it should return them, not the job itself
- async iterator's job is to read batch of messages and executeTask() each of them in eventloop

#### Simple work plan

- [x] Make MVP for the worker that uses executeTask in the simplest way possible

#### Success and findings

I decided to put only minimum amount to identify step_task on the pgmq queue
(run_id and step_slug for now).

The idea to use async generator with interruptible sleep as a poll+wakeup mechanism
was very neat in theory but very error prone and hard to debug because of the
interruptible sleep race conditions.

I decided to simpolify it and now i use both setInterval for polling
and just LISTEN callback to put work on eventloop directly.

This seems to be working extremely well.

### [x] Brainstorm ideas for step_type and worker_backend modularity

So, from my chats with o1 it is apparent that my current design is very modular
and it would be easy to implement the step types and custom worker backends.

In a nutshell, we have 3 layers:

- orchestration (start_step, complete_step, fail_step)
- worker backend (enqueue_step_task, start_step_task, complete_step_task, fail_step_task)
- step types (handle_step_task_completion, handle_step_task_failure, handle_step_task_start etc).

#### Orchestration layer

Orchestration layer is one that is concerned about steps and putting work on the queue.
It is not concerned with how the work will be performed or how many distinct tasks
are required to complete the step.

#### Worker Backend layer

Worker backend layer is concerned with how the work will be performed.
It exposes a small set of db functions that are called by orchestration layer.
They are responsible for managing step_tasks, retries and their mapping to
the underlying message queue messages.

#### Step Type layer

Step Type layer is concerned with what work and when should be performed.
It is responsible for creating new step_tasks and exposes few helper functions
that will be called by orchestration or worker backend layers:

- handle_step_task_start, handle_step_task_failure, handle_step_task_completion

I imagine on each step it can request to process more work and orchestration
layer would just get the work definition returned by the step type layer
and will use worker backend layer to enqueue the work appropriately.

### [ ] Resolve problems with enqueueing started or completed tasks

There is some kind of race condition that can happen when worker dies because
of wall clock or CPU clock limits.

```
[Info] readMessages Result(1) [
  {
    msg_id: "765",
    read_ct: 1,
    enqueued_at: 2024-12-17T19:06:28.820Z,
    vt: 2024-12-17T19:06:59.463Z,
    message: {
      run_id: "4ca35f9e-b180-4a26-8230-58c4bd4be2bc",
      step_slug: "extract_frames"
    }
  }
]

[Info] processMessage() {
  run_id: "4ca35f9e-b180-4a26-8230-58c4bd4be2bc",
  step_slug: "extract_frames"
}

[Info] ON UNLOAD

runtime has escaped from the event loop unexpectedly: event loop error: PostgresError: Expected step_tasks status to be one of {queued} but got 'completed'
    at ErrorResponse (https://deno.land/x/postgresjs@v3.4.5/src/connection.js:791:26)
    at handle (https://deno.land/x/postgresjs@v3.4.5/src/connection.js:477:6)
    at data (https://deno.land/x/postgresjs@v3.4.5/src/connection.js:318:9)
    at https://deno.land/x/postgresjs@v3.4.5/polyfills.js:138:30
    at Array.forEach (<anonymous>)
    at call (https://deno.land/x/postgresjs@v3.4.5/polyfills.js:138:16)
    at success (https://deno.land/x/postgresjs@v3.4.5/polyfills.js:98:9)
    at eventLoopTick (ext:core/01_core.js:168:7)
    at cachedError (https://deno.land/x/postgresjs@v3.4.5/src/query.js:170:23)
    at new Query (https://deno.land/x/postgresjs@v3.4.5/src/query.js:36:24)
    at sql (https://deno.land/x/postgresjs@v3.4.5/src/index.js:113:11)
    at startStepTask (file:///home/jumski/Code/jumski/feedwise/pkgs/supabase/functions/_pgflow/worker/startStepTask.ts:4:28)
```

I have no clue yet whas is causing this issue, but it is definitely caused
by the wall clock/cpu clock limit and edge function dying unexpectedly.

#### [ ] Try to stop LISTEN and polling when onbeforeunload is called

> if the onbeforeunload event is triggered in a Supabase Edge Function worker, any new request to the same Edge Function endpoint will result in a new instance of the Edge Function worker being spawned
