# pgflow SQL Core

PostgreSQL-native workflow engine for defining, managing, and tracking DAG-based workflows directly in your database.

## Overview

The pgflow SQL Core provides the data model, state machine, and transactional functions for workflow management. It treats workflows as DAGs of steps, each step being a simple state machine. This package focuses on:

- Defining and storing workflow shapes
- Managing workflow state transitions
- Exposing transactional functions for workflow operations
- Providing APIs for task polling and status updates

The actual execution of workflow tasks is handled by the [Edge Worker](../edge-worker/README.md), which calls back to the SQL Core to acknowledge task completion or failure.

## Features

- **Declarative Workflows**: Define flows and steps via SQL tables
- **Dependency Management**: Explicit step dependencies with atomic transitions
- **Configurable Behavior**: Per-flow and per-step options for timeouts, retries, and delays
- **Queue Integration**: Built on pgmq for reliable task processing
- **Transactional Guarantees**: All state transitions are ACID-compliant

## Core API

### Define shape of the flow

Defining a flow is done using two SQL functions: `create_flow` and `add_step`.

`add_step` accepts an optionsl `deps` array of step slugs that the new step depends on.

```sql
-- Define workflow with parallel steps
SELECT pgflow.create_flow('web_analysis');
SELECT pgflow.add_step('web_analysis', 'fetch_url');
SELECT pgflow.add_step('web_analysis', 'analyze_text', deps => ARRAY['fetch_url']);
SELECT pgflow.add_step('web_analysis', 'extract_images', deps => ARRAY['fetch_url']);
SELECT pgflow.add_step('web_analysis', 'create_report', deps => ARRAY['analyze_text', 'extract_images']);
```

### Start a flow run

To start a flow, you just need to call `start_flow` with a flow slug and JSONB object representing input arguments.

```sql
SELECT * FROM pgflow.start_flow(
  flow_slug => 'web_analysis', 
  input => '{"url": "https://example.com"}'
);

--     run_id  | flow_slug    | status  |  input                         | output | remaining_steps 
-- ------------+--------------+---------+--------------------------------+--------+-----------------
--  <run uuid> | web_analysis | started | {"url": "https://example.com"} | [NULL] |               4
```

This will:

- create `step_states` for all steps in the flow
- start root steps (in our case `fetch_url`)
- create a task for the root steps
- enqueue a message on PGMQ queue

### Worker polls for tasks and executes handlers

The Edge Worker continuously polls for available tasks using the `poll_for_tasks` function, which returns tasks ready for processing:

```sql
SELECT * FROM pgflow.poll_for_tasks(
  queue_name => 'web_analysis',
  vt => 60, -- visibility timeout in seconds
  qty => 5  -- maximum number of tasks to fetch
);
```

When a task is polled:
1. The message is locked (hidden) from other workers for the specified visibility timeout
2. The attempts counter is incremented for the task
3. The step input is constructed by combining the run input with outputs from completed dependency steps
4. The worker executes the appropriate handler with this input payload

### Worker acknowledges completion of successful executions

After a task is successfully processed, the worker calls `complete_task` to acknowledge completion:

```sql
SELECT pgflow.complete_task(
  run_id => '<run_uuid>',
  step_slug => 'fetch_url',
  task_index => 0,
  output => '{"content": "HTML content", "status": 200}'
);
```

When a task is completed:
1. The task status is updated to 'completed' and the output is saved
2. The message is archived in the PGMQ archive table
3. The corresponding step state is updated (to 'completed' if all tasks for this step are done)
4. Any dependent steps that now have all dependencies completed are automatically started
5. The run's remaining_steps counter is decremented if a step was completed
6. If all steps are complete, the run is marked as completed and final outputs are aggregated

### Worker acknowledges failure of executions

If a task fails during processing, the worker acknowledges this using `fail_task`:

```sql
SELECT pgflow.fail_task(
  run_id => '<run_uuid>',
  step_slug => 'fetch_url',
  task_index => 0,
  error_message => 'Connection timeout when fetching URL'
);
```

When a task fails:
1. The system checks if there are remaining retry attempts available
2. If retries are available:
   - The task remains in 'queued' status for another attempt
   - The message is given a delayed visibility based on exponential backoff
3. If no retries remain:
   - The task is marked as 'failed'
   - The step is marked as 'failed'
   - The run is marked as 'failed'
   - The message is archived in the PGMQ archive table

### Retries and timeouts

Retry behavior can be configured at both the flow and step level:

```sql
-- Flow-level defaults
SELECT pgflow.create_flow(
  flow_slug => 'web_analysis',
  max_attempts => 3,    -- Maximum retry attempts (including first attempt)
  base_delay => 5,      -- Base delay in seconds for exponential backoff
  timeout => 60         -- Task timeout in seconds
);

-- Step-level overrides
SELECT pgflow.add_step(
  flow_slug => 'web_analysis',
  step_slug => 'fetch_url',
  deps_slugs => ARRAY[]::text[],
  max_attempts => 5,    -- Override max attempts for this step
  base_delay => 2,      -- Override base delay for exponential backoff
  timeout => 30         -- Override timeout for this step
);
```

The system applies exponential backoff for retries using the formula:
```
delay = base_delay * (2 ^ attempts_count)
```

Timeouts are enforced by setting the message visibility timeout to the step's timeout value plus a small buffer. If a worker doesn't acknowledge completion or failure within this period, the task becomes visible again and can be retried.

### Run completion with output

When all steps in a run are completed, the run status is automatically updated to 'completed' and its output is set. The output is an aggregation of all the outputs from final steps (steps that have no dependents):

```sql
-- Example of a completed run with output
SELECT run_id, status, output FROM pgflow.runs WHERE run_id = '<run_uuid>';

--     run_id  | status    | output
-- ------------+-----------+-----------------------------------------------------
--  <run uuid> | completed | {"create_report": {"summary": "...", "images": 5}}

## Schema Design

### Static definition tables

- `flows` (just an identity for the workflow with some global options)
- `steps` (DAG nodes belonging to particular `flows`, with option overrides)
- `deps` (DAG edges between `steps`)

### Runtime state tables

- `runs` (execution instances of `flows`)
- `step_states` (states of individual `steps` within a `run`)
- `step_tasks` (units of work for individual `steps` within a `run`, so we can have fanouts)

## Execution Model

The SQL Core handles the workflow lifecycle through these key operations:

1. **Definition**: Workflows are defined using `create_flow` and `add_step`
2. **Instantiation**: Workflow instances are started with `start_flow`, creating a new run
3. **Task Management**: The [Edge Worker](../edge-worker/README.md) polls for available tasks using `poll_for_tasks`
4. **State Transitions**: When the Edge Worker reports back using `complete_task` or `fail_task`, the SQL Core handles state transitions and schedules dependent steps
