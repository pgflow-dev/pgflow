## Edge Worker Refactor

The Edge Worker exposes more configuration options that we need in pgflow.
This configuration object is not organized.

### Differences

Worker currently manages the retry logic, but in SQL Core it was moved to SQL.

Now worker is only supposed to:

- call `poll_for_tasks` in the main loop, instead of `read_with_poll`

  ```sql
  create or replace function pgflow.poll_for_tasks(
    queue_name text,
    vt integer,
    qty integer,
    max_poll_seconds integer default 5,
    poll_interval_ms integer default 100
  )
  ```

- gets returned array of `pgflow.worker_task` records 

  ```sql
  create type pgflow.worker_task as (
    flow_slug TEXT,
    run_id UUID,
    step_slug TEXT,
    input JSONB
  );
  ```

- should use `flow_slug` and `step_slug` to find appropriate step from connected Flow definition
- should call the handler with `input` from `worker_task`
- should call `complete_task` or `fail_task` when appropriate, no need to manage any retry logic at all

### Required changes

We need a way to customize the bahviour of the worker via the factory pattern and updated configuration
object:

- `ReadWithPollPoller` must be swappable for a new implementation that will support `poll_for_tasks`
  so, which object is passed should be configurable
- `ExecutionController` mostly stays the same, but it needs to spawn new class `TaskExecutor` that will
  be very similar to `MessageExecutor` but will know to how execute the `pgflow.worker_task`
  based on the `flow_slug` and `step_slug`
- this new `TaskExecutor` class should have configurable `flow` option, which will accept objects of `Flow` class,
  so it can find appropriate handler function and call it with `input` from `worker_task`
- this class should also use `complete_task` or `fail_task` instead of `archive` when appropriate
- `handleExecutionError` should not be responsible for any retry logic, in fact, any retry configuration should
  not be available when setting up the worker for handling pgflow tasks

### Configuration validation

We need to validate configuration options and i think this responsibility should
be either in each final object that consumes particular configuration fragment
or in the factory/builder itself.

### Flow DSL compatibility

`Worker` or one of its components (existing or new, if you decide to create new one)
needs to be able to use provided `Flow` class (it must be "configurable" - users must be able
to just pass the `Flow` instance to the `Worker` constructor or to the pgflow's version
of `EdgeWorker.start()` methot) and store it for the lifeitme of the worker.

It should be able to find appropriate handler function based on the `flow_slug` and `step_slug`
that are included in the `worker_task` object.

#### Verification of flwo shape

`Worker` or new class that you create will need to be able to get the `Flow` instance,
check if it is already in the database, check if it contains same amount of steps and deps
as the one in database (if present), and throw an error if it does not match.

In development mode, it should instead drop the flow and all its dependent rows
and recreate a new one using provided `Flow` instance.

We should define which parts of `Flow` instance break the compatibility and need
a new `flow_slug` (so, when to throw in production and recreate in development mode).

The parts, that does not break the compatibility should be just ignored for now:

- timeout
- baseDelay
- maxAttempts

### Proposed approach

Approach this refactoring like this:

- identify which options passed to `Worker` constructor are going always together
- then idenfity, if those options are used in other places than to instantiate 
  the classess that we need to make swappable 
  (poller, message executor + way to customize them for ExecutionController and BatchProcessor)
- clustor options into few logical groups, probably mapping the responsibilities that various
  classes have, like: polling, execution, error handling (etc, example groups, try to figure out
  the most important ones without splitting too much, must be usable without pgflow extensions)
- we need to keep in mind, that we want to allow users to use Edge Worker with a single
  message handler function, like it is possible with current implementation
- ideally, users not using pgflow would not be exposed to any pgflow-related options and methods at all
- ideally, the `Worker` class will be open to extension but not modification, so it is possible
  to configure how it behaves completely by using different configuration object

