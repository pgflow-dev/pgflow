# pgflow Nomenclature Guide

This guide provides terminology standards for writing and auditing pgflow documentation. Use it to ensure consistency across all user-facing documentation in `pkgs/website/src/content/docs/`.

## Project Naming

### The Project Name

**IMPORTANT**: Always use lowercase: **pgflow**

Never use:

- pgFlow
- PgFlow
- Pgflow (except in class names)
- PGFlow

**Exception**: PascalCase in class names is acceptable (e.g., `PgflowClient`).

### Package Names

All packages use the `@pgflow/` namespace except the cli, as it is short so `npx pgflow` is available:

- `@pgflow/core` - PostgreSQL workflow engine (SQL Core)
- `@pgflow/dsl` - TypeScript DSL for workflow definition
- `@pgflow/edge-worker` - Task queue worker for execution
- `pgflow` - Command-line interface
- `@pgflow/client` - TypeScript client library
- `@pgflow/example-flows` - Example workflow definitions
- `@pgflow/website` - Documentation site

## Core Concepts

### Workflow Components

| Term                    | Definition                                       | Usage Example                        |
| ----------------------- | ------------------------------------------------ | ------------------------------------ |
| **Flow**                | A complete workflow definition (DAG)             | "Define a flow with the DSL"         |
| **Step**                | A node in the workflow DAG                       | "Add steps to your flow"             |
| **Task**                | A unit of work for a step (execution instance)   | "Worker executes tasks from queue"   |
| **Run**                 | An execution instance of a flow                  | "Start a run with input data"        |
| **Handler**             | Function that executes step logic                | "Write handlers for each step"       |
| **Dependencies** (deps) | Steps that must complete before a step can start | "Define dependencies with dependsOn" |

**Note on "Step"**: Context-dependent term. Definition context = `pgflow.steps` table. Runtime context = `pgflow.step_states` table. In docs, use "step" for both - context makes it clear. Only use "step state" when disambiguation is needed.

### Step Types

| Type                     | Description                  | When to Use                            |
| ------------------------ | ---------------------------- | -------------------------------------- |
| **Regular Step**         | Creates one task per run     | Default for most steps                 |
| **Map Step**             | Processes arrays in parallel | Use `.map()` to process array elements |
| **Root Step**            | Step with no dependencies    | Entry point for workflow               |
| **Final Step**           | Step with no dependents      | Produces run output                    |
| **Array-Returning Step** | Returns an array             | Use `.array()` for semantic clarity    |

**Map Step Variants**:

- **Root Map** - Maps over flow input array (no dependencies)
- **Dependent Map** - Maps over another step's array output

### Architecture Layers

The system has three distinct layers:

| Layer                     | Also Called                   | Responsibility                        |
| ------------------------- | ----------------------------- | ------------------------------------- |
| **Layer 3 - DSL**         | Definition Layer, User Intent | TypeScript API for defining workflows |
| **Layer 2 - SQL Core**    | Orchestration Layer           | PostgreSQL-native DAG orchestration   |
| **Layer 1 - Edge Worker** | Execution Layer               | Task execution runtime                |

## Database Terms

### Table Names

All tables use **plural nouns**:

**Definition Tables** (static):

- `flows` - Flow definitions
- `steps` - Step definitions
- `deps` - Dependencies between steps

**Runtime Tables** (dynamic):

- `runs` - Flow execution instances
- `step_states` - Step state within runs
- `step_tasks` - Individual work units

**Worker Tables**:

- `workers` - Edge Function worker tracking

### Naming Conventions

#### Timestamps

Always use `*_at` suffix:

- `created_at`, `started_at`, `completed_at`, `failed_at`

#### Identifiers

- `*_slug` - Text identifier (e.g., `flow_slug`, `step_slug`)
- `*_id` - UUID identifier (e.g., `run_id`, `worker_id`)

#### Counts

- `*_count` - Total count (e.g., `deps_count`)
- `remaining_*` - Countdown counter (e.g., `remaining_steps`, `remaining_tasks`)

## Slugs

Slugs are unique text identifiers with specific rules:

- **Length**: 1-128 characters
- **Format**: `[a-zA-Z_][a-zA-Z0-9_]*`
  - Start with letter or underscore
  - Continue with letters, numbers, or underscores
- **Reserved Words**: Cannot use `'run'`

**Examples**:

- ✅ `analyze_website`
- ✅ `fetch_data`
- ✅ `_internal_step`
- ❌ `analyze-website` (hyphen not allowed)
- ❌ `123_step` (starts with number)
- ❌ `run` (reserved word)

## Status Values

### Run Statuses

- `started` - Run is in progress
- `completed` - Run completed successfully
- `failed` - Run failed permanently

### Step Statuses

- `created` - Step created but not yet started
- `started` - Step is executing
- `completed` - Step completed successfully
- `failed` - Step failed permanently

### Task Statuses

- `queued` - Task queued in PGMQ
- `started` - Task is executing
- `completed` - Task completed successfully
- `failed` - Task failed (may be retried or permanent)

## Configuration Terms

### Retry Configuration

- `maxAttempts` (or `max_attempts` in SQL) - Maximum retry attempts (including first attempt)
- `baseDelay` (or `base_delay` in SQL) - Base delay in seconds for exponential backoff
- `timeout` - Task timeout in seconds

**Formula**: Retry delay = `base_delay * (2 ^ attempts_count)`

### Worker Configuration

- `maxConcurrent` - Max tasks to process in parallel (default: 10)
- `maxPgConnections` - Max PostgreSQL connection pool size (default: 4)
- `maxPollSeconds` - Max time polling for messages (default: 5 for queue, 2 for flow)
- `pollIntervalMs` - Interval between poll attempts (default: 200 for queue, 100 for flow)
- `visibilityTimeout` - Time message is hidden from other workers (default: 10 for queue, 2 for flow)
- `batchSize` - Number of messages to fetch per poll (default: 10)
- `queueName` - Name of queue to poll (default: 'tasks', queue worker only)
- `retry` - Retry configuration object (queue worker only):
  - `retry.strategy` - Either 'fixed' or 'exponential'
  - `retry.limit` - Maximum retry attempts
  - `retry.baseDelay` - Base delay in seconds
  - `retry.maxDelay` - Maximum delay for exponential backoff (optional, default: 300)
- `retryDelay` - **DEPRECATED**: Use `retry.baseDelay` instead
- `retryLimit` - **DEPRECATED**: Use `retry.limit` instead

## DSL Methods

| Method                 | Purpose                                     |
| ---------------------- | ------------------------------------------- |
| `.step()`              | Define a regular step                       |
| `.array()`             | Mark step as returning array (semantic)     |
| `.map()`               | Define array processing step                |
| `.getStepDefinition()` | Retrieve step definition with proper typing |

### Runtime Options

**Flow-level options:**

- `maxAttempts` - Maximum retry attempts
- `baseDelay` - Base delay for exponential backoff
- `timeout` - Task timeout in seconds

**Step-level options (additional):**

- `startDelay` - Optional delay before starting step

## Data Flow Terms

### Handler Signatures

Step handlers use **asymmetric signatures** based on whether they have dependencies:

**Root steps (no dependencies):**
- First parameter: `flowInput` - the original flow input directly
- Second parameter: `ctx` - context object (env, supabase, flowInput, etc.)

**Dependent steps (with dependsOn):**
- First parameter: `deps` - object with outputs from dependency steps
- Second parameter: `ctx` - context object (includes `ctx.flowInput` if needed)

### Input Structure

- `flowInput` - Original flow input (root step first parameter)
- `deps.{stepName}` - Output from dependency step (dependent step first parameter)
- `ctx.flowInput` - Original flow input via context (available in all steps)

### Map Step Input

- Map step handlers receive **two parameters**:
  1. **item** - The assigned array element
  2. **context** - BaseContext object (env, shutdownSignal, rawMessage, workerConfig, flowInput)
- Map handlers do NOT receive FlowContext (no access to `context.stepTask`)
- Access to original flow input via `context.flowInput`
- Context provides environment, worker metadata, and flow-level input data

### Output Handling

- **Step Output** - Return value from handler
- **Aggregated Output** - Combined outputs from final steps
- **Map Output Aggregation** - Array of task outputs (order preserved)

## CLI Commands

| Command                            | Description                              |
| ---------------------------------- | ---------------------------------------- |
| `npx pgflow@latest install`        | Install pgflow in Supabase project       |
| `npx pgflow@latest compile <file>` | Compile TypeScript flow to SQL migration |

**Common Options**:

- `--supabase-path <path>` - Custom Supabase directory
- `--deno-json <path>` - Custom deno.json config
- `--yes` / `-y` - Skip confirmation prompts

## Client API

### Classes

- `PgflowClient` - Main client for managing flows
- `FlowRun` - Represents a run instance
- `FlowStep` - Represents a step within a run

### Status Enums

- `FlowRunStatus` - Run status values: `Started`, `Completed`, `Failed`
- `FlowStepStatus` - Step status values: `Created`, `Started`, `Completed`, `Failed`

### Key Methods

**PgflowClient:**

- `startFlow(flowSlug, input)` - Start new workflow execution
- `getRun(runId)` - Retrieve existing run
- `dispose()` / `disposeAll()` - Clean up resources
- `onRunEvent(callback)` - Subscribe to all run events globally
- `onStepEvent(callback)` - Subscribe to all step events globally

**FlowRun:**

- `on(event, callback)` - Subscribe to run events
- `waitForStatus(status, options)` - Wait for specific status
- `step(stepSlug)` - Get FlowStep instance for a specific step
- `dispose()` - Clean up resources

**FlowStep:**

- `on(event, callback)` - Subscribe to step events
- `waitForStatus(status, options)` - Wait for specific status

### Key Properties

**FlowRun (read-only):**

- `run_id`, `flow_slug`, `status`
- `input`, `output`
- `error`, `error_message`
- `started_at`, `completed_at`, `failed_at`
- `remaining_steps`

**FlowStep (read-only):**

- `run_id`, `step_slug`, `status`
- `output`, `error`, `error_message`
- `started_at`, `completed_at`, `failed_at`

### Event Types

**Run Events**: `started`, `completed`, `failed`, `*` (all)
**Step Events**: `created`, `started`, `completed`, `failed`

## Context Resources

**Context Properties** (check these in handler examples):

- `context.env` - Environment variables
- `context.shutdownSignal` - AbortSignal for graceful shutdown
- `context.rawMessage` - Original pgmq message metadata
- `context.workerConfig` - Resolved worker configuration
- `context.stepTask` - Current step task details (regular steps only)
- `context.sql` - PostgreSQL client (Supabase platform)
- `context.supabase` - Supabase client (Supabase platform)

**Note**: Map and array step handlers receive BaseContext (no `stepTask`). Regular step handlers receive FlowContext (includes `stepTask`).

## Special Behaviors

### Taskless Steps

- Steps with `initial_tasks = 0`
- Occur when map step receives empty array `[]`
- Complete immediately without spawning tasks

### Empty Array Cascade

- When map receives `[]`, completes immediately
- Triggers cascade to dependent maps

### Type Violations

- Regular step outputting non-array to map step
- Fails the entire run
- Error prefix: `[TYPE_VIOLATION]`

### Dependency Resolution

- `deps_count` - Static count from definition
- `remaining_deps` - Runtime countdown
- Step becomes "ready" when `remaining_deps = 0`

### Visibility Timeout (vt)

- PGMQ concept: time until message becomes visible
- Set to: `task_timeout + 2 seconds`
- Prevents duplicate processing

## Broadcast Events

Events sent via `realtime.send()`:

### Event Types

- `run:started`, `run:completed`, `run:failed`
- `step:started`, `step:completed`, `step:failed`

### Channel Patterns

- Run events: `pgflow:run:{run_id}`
- Step events: `step:{step_slug}:{event_type}` (also sent to run channel)

## Abbreviations

pgflow-specific abbreviations (avoid in user-facing docs unless defined):

| Abbreviation | Full Term          | Context                         |
| ------------ | ------------------ | ------------------------------- |
| **vt**       | Visibility Timeout | PGMQ message hiding duration    |
| **deps**     | Dependencies       | Steps that must complete first  |
| **dep**      | Dependency         | Single dependency (parent step) |

Common abbreviations (OK to use):

- **DAG** - Directed Acyclic Graph
- **DSL** - Domain Specific Language
- **CLI** - Command-Line Interface
- **API** - Application Programming Interface

## Naming Patterns

- **Slugs** - Identifiers using `[a-zA-Z0-9_]`, max 128 chars
- **Topological Order** - Steps added in dependency order

## Summary

This guide provides consistent terminology for pgflow documentation. When writing or auditing docs:

1. Always use lowercase **pgflow**
2. Use correct status values (started/completed/failed, not running/succeeded)
3. Follow slug rules for identifiers
4. Distinguish between layers (DSL, SQL Core, Worker)
5. Use correct method names (`.step()`, `.map()`, `.array()`)
6. Use proper class names (`PgflowClient`, `FlowRun`, `FlowStep`)
7. Check that event types match (started/completed/failed/created)
8. Verify configuration term accuracy (maxAttempts, baseDelay, timeout)
9. Ensure map step behavior is correctly described
10. Use correct abbreviations and avoid unexplained jargon
