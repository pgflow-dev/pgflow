Your job is to implement required SQL schemas and functions for an MVP of my open source Postgres-native workflow orchestration engine called pgflow.

The main idea of the project is to keep shape of the DAG (nodes and edges) and its runtime state in the database
and expose SQL functions that will allow to propagate through the state.

Real work is done on the task queue workers and the functions from pgflow are only orchestrating
the queue messages.

Workers are supposed to call user functions with the payload from the queue message,
and should acknowledge the completion of the task or its failure (error thrown) by
calling appropriate pgflow SQL functions.

This way the orchestration is decoupled from the execution.

I have a concrete implementation plan for you to follow and will unfold it
step by step below.

## Assumptions/best practices

### We are building Minimal Viable Product

Remember that we are building MVP and main focus should be on shipping something as soon as possible,
by cutting scope, simplifying the architectures and code.

But the outlined features are definitely something that we will be doing in the future.
I am most certain about the foreach-array steps - this is a MUST have.
So your focus should be on trying to implement the MVP but not closing the doors to the future improvements.

### Slugs

We do not use serial IDs nor UUIDs for static things, we use "slugs" instead.
A slug is just a string that conforms to following rules:

```sql
slug is not null
and slug <> ''
and length(slug) <= 128
and slug ~ '^[a-zA-Z_][a-zA-Z0-9_]*$';
```

We use UUID for identifying particular run of the flow.
But the states of steps for that particular run are not identified by separate UUIDs,
but rather by a pair of run_id and step_slug. This pattern allows to easily refer
to steps and flows by their slugs. **Leverage this pattern everywhere you can!**

### References/fkeys

Use foreign keys everywhere to ensure consistency.
Use composite foreign keys and composite primary keys composed of flow/step slugs and run_id's if needed.

### Declarative vs procedural

**YOU MUST ALWAYS PRIORITIZE DECLARATIVE STYLE** and prioritize Batching operations.

Avoid plpgsql as much as you can.
It is important to have your DB procedures run in batched ways and use declarative rather than procedural constructs where possible:

- do not ever use `language plplsql` in functions, always use `language sql`
- don't do loops, do SQL statements that address multiple rows at once.
- don't write trigger functions that fire for a single row, use `FOR EACH STATEMENT` instead.
- don't call functions for each row in a result set, a condition, a join, or whatever; instead use functions that return `SETOF` and join against these.

If you're constructing dynamic SQL, you should only ever use `%I` and `%L` when using `FORMAT` or similar; you should never see `%s` (with the very rare exception of where you're merging in another SQL fragment that you've previously formatted using %I and %L).

Remember, that functions have significant overhead in Postgres - instead of factoring into lots of tiny functions, think about how to make your code more expressive so there's no need.

## Schemas

### pgflow.flows

A static definition of a flow (DAG):

```sql
CREATE TABLE pgflow.flows (
    flow_slug text PRIMARY KEY NOT NULL  -- Unique identifier for the flow
    CHECK (is_valid_slug(flow_slug))
);
```

### pgflow.steps

A static definition of a step within a flow (a DAG "nodes"):

```sql
CREATE TABLE pgflow.steps (
    flow_slug text NOT NULL REFERENCES flows (flow_slug),
    step_slug text NOT NULL,
    PRIMARY KEY (flow_slug, step_slug),
    CHECK (is_valid_slug(flow_slug)),
    CHECK (is_valid_slug(step_slug))
);
```

### pgflow.deps

A static definition of dependencies between steps (a DAG "edges"):

```sql
CREATE TABLE pgflow.deps (
    flow_slug text NOT NULL REFERENCES pgflow.flows (flow_slug),
    dep_step_slug text NOT NULL,  -- The step that must complete first
    step_slug text NOT NULL,   -- The step that depends on dep_step_slug
    PRIMARY KEY (flow_slug, dep_step_slug, step_slug),
    FOREIGN KEY (flow_slug, dep_step_slug)
    REFERENCES pgflow.steps (flow_slug, step_slug),
    FOREIGN KEY (flow_slug, step_slug)
    REFERENCES pgflow.steps (flow_slug, step_slug),
    CHECK (dep_step_slug != step_slug),  -- Prevent self-dependencies
    CHECK (is_valid_slug(dep_step_slug)),
    CHECK (is_valid_slug(step_slug))
);
```

### pgflow.runs

A table storing runtime state of given flow.
A run is identified by a `flow_slug` and `run_id`.

```sql
CREATE TABLE pgflow.runs (
    flow_slug text NOT NULL REFERENCES pgflow.flows (flow_slug),
    run_id uuid PRIMARY KEY NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    failed_at timestamptz,
    completed_at timestamptz,
    status text NOT NULL GENERATED ALWAYS AS (
    CASE
    WHEN failed_at IS NOT NULL THEN 'failed'
    WHEN completed_at IS NOT NULL THEN 'completed'
    ELSE 'pending'
    END,
    payload jsonb NOT NULL,
    CHECK (NOT (completed_at IS NOT NULL AND failed_at IS NOT NULL)),
    CHECK (status IN ('pending', 'failed', 'completed')),
    CHECK (is_valid_slug(flow_slug))
);
```

There is also `status` that currently can be pending, failed or completed.

### pgflow.step_states

Represents a state of a particular step in a particular run.

Interesting columns are:

- `status` - the current status of the step, its calculated.
- `step_result` - the return value of the step handler function captured by the worker and passed when acknowledging completion of the task.
  in case of a failure, this will contain the error message/stacktrace, also saved by worker when acknowledging failure

```sql

-- Step states table - tracks the state of individual steps within a run
CREATE TABLE pgflow.step_states (
flow_slug text NOT NULL REFERENCES pgflow.flows (flow_slug), -- denormalized column for performance
step_slug text NOT NULL,
run_id uuid NOT NULL REFERENCES pgflow.runs (run_id),
created_at timestamptz NOT NULL DEFAULT now(),
failed_at timestamptz,
completed_at timestamptz,
status text NOT NULL GENERATED ALWAYS AS (
CASE
WHEN failed_at IS NOT NULL THEN 'failed'
WHEN completed_at IS NOT NULL THEN 'completed'
ELSE 'pending'
END
) STORED,
step_result jsonb,
PRIMARY KEY (run_id, step_slug),
FOREIGN KEY (flow_slug, step_slug)
REFERENCES pgflow.steps (flow_slug, step_slug),
CHECK (NOT (completed_at IS NOT NULL AND failed_at IS NOT NULL)),
CHECK (status IN ('pending', 'failed', 'completed')),
CHECK (is_valid_slug(flow_slug)),
CHECK (is_valid_slug(step_slug))
);
```

### pgflow.step_tasks

This table is really unique and interesting. We are starting the development
of the flow orchestration engine with a simple step that runs one unit of work.

But I imagine we would suppport additional types of steps, like:

- a step that requires input array and enqueues a task per array item, so they are created in parallel
- a step that runs some preprocessing/postprocessing in an additional task

So in order to accomodate this, we need an additional layer between step_state and
an actual task queue, in order to track which messages belong to which steps,
in case there are more than 1 unit of work for given step.

```sql
-- Executio logs table - tracks the task of individual steps
CREATE TABLE pgflow.step_tasks (
flow_slug text NOT NULL REFERENCES pgflow.flows (flow_slug),
step_slug text NOT NULL,
run_id uuid NOT NULL REFERENCES pgflow.runs (run_id),
status text NOT NULL DEFAULT 'queued',
payload jsonb NOT NULL, -- payload that will be passed to queue message
result jsonb, -- like step_result but for task, can store result or error/stacktrace
message_id bigint, -- an id of the queue message
CONSTRAINT step_tasks_pkey PRIMARY KEY (run_id, step_slug),
FOREIGN KEY (run_id, step_slug)
REFERENCES pgflow.step_states (run_id, step_slug),
CHECK (status IN ('queued', 'started', 'failed', 'completed')),
CHECK (is_valid_slug(flow_slug)),
CHECK (is_valid_slug(step_slug))
);
```

## Typescript DSL, topological ordering and acyclicity validation

The simple typescript DSL will be created that will have string typing
and will enforce adding steps in a topological order, preventing
cycles by the strict ordering of the steps addition.

Typescript DSL looks like this:

```ts
const BasicFlow = new Flow<string>()
  .step("root", ({ run }) => {
    return `[${run}]r00t`;
  })
  .step("left", ["root"], ({ root: r }) => {
    return `${r}/left`;
  })
  .step("right", ["root"], ({ root: r }) => {
    return `${r}/right`;
  })
  .step("end", ["left", "right"], ({ left, right, run }) => {
    return `<${left}> and <${right}> of (${run})`;
  });
```

This will be compiled to a simple SQL calling SQL function `pgflow.add_step(flow_slug, step_slug, dep_step_slugs[])`:

```sql
SELECT pgflow.add_step('basic', 'root', ARRAY[]::text[]);
SELECT pgflow.add_step('basic', 'left', ARRAY['root']);
SELECT pgflow.add_step('basic', 'right', ARRAY['root']);
SELECT pgflow.add_step('basic', 'end', ARRAY['left', 'right']);
```

## SQL functions API

This describes public SQL functions that are available to developer using pgflow
and to the workers.

Developer calls `start_flow` and rest is called by the workers.

### pgflow.start_flow(flow_slug::text, payload::jsonb)

This function is used to start a flow.
It should work like this:

- create a new `pgflow.runs` row for given flow_slug
- create all the `pgflow.step_states` rows corresponding to the steps in the flow
- find root steps (ones without dependencies) and call "start_step" on each of them

### pgflow.start_step(run_id::uuid, step_slug::text)

This function is called by start_flow but also by complete_step_task (or somewhere near its call)
when worker acknowledges the step_task completion and it is detected, that there are ready dependant
steps to be started.

It should probably call start_step_task under the hood, which will:

- updating step_state status/timestamps
- creating a step_task row
- enqueueing a queue message for this step_task

For other step types, like array/foreach, it would probably call the step_task
for each array item, so more than one step task is created and more than one message is enqueued.

### pgflow.start_step_task(run_id::uuid, step_slug::text, task_id::bigint)

I am not yet sure how this will work for other step types that will need more step tasks.
But probably each step type would have its own implementation of this function,
and a simple step type will just create a new step_task row and enqueue it.

But an array/foreach step type would need a different implementation.
Would need to check the payload for the step which is an array, and would
create a new step_task for each array item and enqueue as many messages as there are items in the array.

### pgflow.complete_step_task(run_id::uuid, step_slug::text, result::jsonb)

This will be called by the worker when a step_task is completed.
It will work like this in the simplified version when one step_state corresponds to one step_task:

- it marks step_task as completed, saving the result
- it in turns mark step_state as completed, saving the result
- then it should check for any dependant steps (steps that depend on just completed step) in the same run
- it should then check if any of those dependant steps are "ready" - meaning, all their dependencies are completed
- for each of those

I am not yet sure how this will work for other step types that will need more step tasks.
Probably each step type would have its own implementation of this function,
so a simple step will just call complete_step_state when complete_step_task is called.

An array/foreach step type would need a different implementation.
Would probably need to check if other step_tasks are still pending.
If all are already completed, it would just call complete_step_state,
otherwise it will just continue, so other (last) step task can complete the step state.

### pgflow.fail_step_task(run_id::uuid, step_slug::text, error::jsonb)

This is very similar to complete_step_task, but it will mark step_task as failed,
will save error message and will call fail_step_state instead of complete_step_state.
