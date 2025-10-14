# pgflow Architecture Guide

This guide explains the overall architecture of pgflow, providing a navigational map to the codebase and documenting cross-cutting concepts that span multiple packages.

## Overview

**pgflow** is a PostgreSQL-native workflow orchestration engine that replaces external control planes (like Airflow or Temporal) with a zero-deployment, database-centric approach.

**Core Philosophy**: Postgres is the single source of truth for all workflow definitions, state, and execution.

## Design Principles

1. **Postgres = Single Source of Truth** - All workflow definitions, state transitions, and task queues live in the database
2. **Opinionated over Configurable** - Clear conventions (DAGs only, JSON serialization, topological order)
3. **Robust Yet Simple** - ACID transactions and reliable queue processing without exotic features
4. **Compile-Time Safety** - TypeScript type checking and SQL referential integrity prevent runtime errors
5. **Serverless-Ready** - Stateless workers enable horizontal scaling without coordination overhead

## The Three-Layer Architecture

pgflow separates concerns across three distinct layers. Each layer has a clear responsibility and knows nothing about the implementation details of other layers.

### Layer 3: DSL (Definition Layer)

**What it is**: TypeScript API for defining workflows with compile-time type safety.

**Location**: `/pkgs/dsl`

**Mental model**: Developer writes workflow intent. Doesn't know about execution or state management.

**Key Methods**:
- `.step({ slug, dependsOn?, ...options }, handler)` - Define a step
- `.array({ slug, dependsOn?, ...options }, handler)` - Step returning array (semantic wrapper)
- `.map({ slug, array?, ...options }, handler)` - Process array elements in parallel (no dependsOn)

**Map Step Modes**:
- **Root map** - Process flow input array (no `array:` property)
- **Dependent map** - Process another step's array (with `array: 'step_slug'`)

**Comprehensive DSL Example** (shows all step types and options):

```typescript
import { Flow } from '@pgflow/dsl/supabase';

// Flow with all options
const CompleteExample = new Flow<{ urls: string[] }>({
  slug: 'completeExample',
  maxAttempts: 3,      // Flow-level default
  timeout: 60,         // Flow-level default
  baseDelay: 2,        // Flow-level default
})
  // Regular step with step-level overrides
  .step(
    {
      slug: 'config',
      maxAttempts: 5,    // Override flow default
      timeout: 120,      // Override flow default
      startDelay: 10,    // Delay before starting (step-specific)
    },
    async (input, context) => {
      // context.env - Environment variables
      // context.shutdownSignal - Graceful shutdown signal
      // context.stepTask - Current task details (run_id, step_slug, input, msg_id, task_index)
      // context.workerConfig - Worker configuration (read-only)
      // context.sql - PostgreSQL client (Supabase preset)
      // context.supabase - Supabase client (Supabase preset)

      return { apiKey: context.env.API_KEY };
    }
  )

  // Root map - processes flow input array
  .map(
    { slug: 'fetchUrls' },
    async (url, context) => {
      // Receives individual array element, not full array
      const response = await fetch(url);
      return { url, html: await response.text() };
    }
  )

  // Array step enriches fetched pages with config data
  .array(
    { slug: 'enrichedPages', dependsOn: ['fetchUrls', 'config'] },
    async (input) => {
      // Enrich each page with config data
      return input.fetchUrls.map(page => ({
        ...page,
        apiKey: input.config.apiKey
      }));
    }
  )

  // Dependent map - processes enriched array
  .map(
    { slug: 'extractLinks', array: 'enrichedPages' },
    async (enrichedPage) => {
      // Has both page data and apiKey from enrichment
      return extractLinks(enrichedPage.html, enrichedPage.apiKey);
    }
  )

  // Array step - returns array (semantic, same as .step())
  .array(
    { slug: 'aggregate', dependsOn: ['extractLinks'] },
    async (input) => {
      // Receives full input object with all previous step outputs
      return input.extractLinks.flat();
    }
  )

  // Regular step depending on multiple steps
  .step(
    { slug: 'save', dependsOn: ['aggregate', 'config'] },
    async (input, context) => {
      await context.sql`
        INSERT INTO results (data) VALUES (${input.aggregate})
      `;
      return { saved: true };
    }
  );

export default CompleteExample;
```

**Compilation**:
```bash
npx pgflow compile path/to/flow.ts
# Generates migration with:
# - SELECT pgflow.create_flow(...)
# - SELECT pgflow.add_step(...) for each step
```

**Important**: See DSL package files for:
- Type inference utilities: `ExtractFlowInput`, `ExtractFlowOutput`, `StepInput`, `StepOutput`
- Handler signature details: `/pkgs/dsl/src/types.ts`
- Supabase preset: `/pkgs/dsl/supabase/`

---

### Layer 2: SQL Core (Orchestration Layer)

**What it is**: Pure SQL implementation of workflow orchestration logic.

**Location**: `/pkgs/core`

**Mental model**: State machine for DAG execution. Doesn't know about DSL syntax or how handlers execute.

**Schema** (see `/pkgs/core/src/migrations/`):

*Definition tables*:
- `flows`, `steps`, `deps`

*Runtime tables*:
- `runs`, `step_states`, `step_tasks`, `workers`

*Custom types*:
- `step_task_record` - Return type for `start_tasks()`

**Core Functions** (see `pgflow--*.sql` migration files):

*Flow Definition*:
- `create_flow`, `add_step`, `is_valid_slug`

*Flow Execution*:
- `start_flow`, `start_flow_with_states`, `get_run_with_states`

*Task Management*:
- `start_tasks`, `complete_task`, `fail_task`

*Orchestration*:
- `start_ready_steps` - Starts steps whose dependencies are complete
- `cascade_complete_taskless_steps` - Handles empty array propagation
- `maybe_complete_run` - Completes run when all steps done, aggregates outputs

*Utilities*:
- `calculate_retry_delay`, `set_vt_batch`, `read_with_poll`

**Critical Cross-Cutting Concepts**:

1. **Two-Phase Polling** - Worker calls `read_with_poll()` then `start_tasks(workerId)` to prevent race conditions
2. **Empty Array Cascade** - When `initial_tasks=0`, `cascade_complete_taskless_steps()` completes entire dependent chain in one transaction
3. **Map Step `initial_tasks` Lifecycle**:
   - Root maps: Set at flow start from input array length
   - Dependent maps: Set to `NULL`, resolved when parent completes
   - Empty arrays: Set to `0`, triggers taskless completion
4. **Type Validation** - `complete_task()` validates non-array to map step fails entire run
5. **Retry Mechanism** - `fail_task()` implements retry with exponential backoff via `calculate_retry_delay()`
6. **Run Completion** - `maybe_complete_run()` aggregates leaf step outputs only (steps with no dependents)

**Realtime Events** (emitted via `realtime.send()` for Client subscriptions):
- `run:started`, `run:completed`, `run:failed`
- `step:started`, `step:completed`, `step:failed`

---

### Layer 1: Edge Worker (Execution Layer)

**What it is**: Stateless task executor that polls queues and runs handler functions.

**Location**: `/pkgs/edge-worker`

**Mental model**: Execution engine. Doesn't know where tasks come from or overall workflow state.

**Worker Lifecycle**:
1. `acknowledgeStart()` - Register worker with `workerId` in database
2. Main loop:
   - `sendHeartbeat()` - Update status, check deprecation
   - If deprecated → exit gracefully
   - Two-phase polling: `readMessages()` then `startTasks(workerId)`
   - Execute handlers (up to `maxConcurrent` parallel)
   - `complete_task()` or `fail_task()`
3. On shutdown:
   - `transitionToStopping()`, wait for tasks, `acknowledgeStop()`, close SQL connection

**Configuration** (see `FlowWorkerConfig` type in `/pkgs/edge-worker/src/types/`):
- `maxConcurrent`, `maxPgConnections`, `batchSize`, `visibilityTimeout`, `maxPollSeconds`, `pollIntervalMs`

**Comprehensive Worker Example** (shows all features):

```typescript
import { createFlowWorker } from '@pgflow/edge-worker';
import { createClient } from '@supabase/supabase-js';
import MyFlow from './_flows/my_flow.ts';

// Create Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Create worker with all configuration options
const worker = createFlowWorker(supabase, MyFlow, {
  // Queue configuration
  queueName: 'tasks',           // Default: 'tasks'

  // Polling configuration
  maxPollSeconds: 2,            // Default: 2
  pollIntervalMs: 100,          // Default: 100
  batchSize: 10,                // Default: 10
  visibilityTimeout: 2,         // Default: 2

  // Concurrency configuration
  maxConcurrent: 10,            // Default: 10
  maxPgConnections: 4,          // Default: 4

  // Retry configuration (exponential backoff)
  retry: {
    strategy: 'exponential',    // or 'fixed'
    delay: 1000,                // Base delay in ms
    maxAttempts: 3,             // Max retry attempts
  },
});

// Start worker (runs until shutdown signal)
await worker.start();

// Worker provides context to handlers:
// - context.env - Environment variables
// - context.shutdownSignal - Graceful shutdown detection
// - context.stepTask - Current task (flow_slug, run_id, step_slug, input, msg_id, task_index)
// - context.workerConfig - Configuration (read-only, frozen)
// - context.rawMessage - Full pgmq message (msg_id, read_ct, enqueued_at, vt)
// - context.sql - PostgreSQL client (Supabase)
// - context.supabase - Supabase client (Supabase)
```

**Important**: See Edge Worker package files for:
- Platform adapter abstraction: `/pkgs/edge-worker/src/adapters/`
- Worker states: `Starting`, `Running`, `Stopping`, `Stopped`, `Deprecated`
- Context types: `/pkgs/edge-worker/src/core/context.ts`
- Auto-restart mechanism: `spawnNewEdgeFunction()` in Supabase adapter

---

## Supporting Components

### CLI (Command-Line Interface)

**Location**: `/pkgs/cli`

**Commands**:
- `pgflow install [--supabase-path <path>] [-y, --yes]` - Sets up pgflow
- `pgflow compile <flow.ts> [--deno-json <path>] [--supabase-path <path>]` - Compiles flows to SQL

**See**: `/pkgs/cli/src/commands/` for implementation details

---

### Client (TypeScript Library)

**Location**: `/pkgs/client`

**Core API** (see `/pkgs/client/src/PgflowClient.ts`):
- `startFlow(slug, input)` - Start new run
- `getRun(run_id)` - Retrieve and subscribe to existing run
- `dispose(run_id)`, `disposeAll()` - Cleanup

**FlowRun API** (see `/pkgs/client/src/FlowRun.ts`):
- `.on(event, handler)` - Events: `'started'`, `'completed'`, `'failed'`, `'*'`
- `.waitForStatus(status, options?)` - Supports `AbortSignal`
- `.step(slug)` - Get FlowStep instance

**FlowStep API** (see `/pkgs/client/src/FlowStep.ts`):
- `.on(event, handler)` - Same event types as FlowRun
- `.waitForStatus(status, options?)` - Step-level status waiting

**Realtime Subscription**: Uses `SupabaseBroadcastAdapter` internally, subscribes via `subscribeToRun(run_id)`

---

## Critical Cross-Package Concepts

### 1. Two-Phase Polling (Worker + SQL Core)

**Why**: Prevents race condition where worker processes message before `step_tasks` record exists.

**How**:
- Phase 1: Worker calls `read_with_poll()` - reserves messages, returns `msg_id`s
- Phase 2: Worker calls `start_tasks(flow_slug, msg_ids, workerId)` - creates `step_tasks`, returns details

**See**:
- Worker implementation: `/pkgs/edge-worker/src/worker/FlowWorkerLifecycle.ts`
- SQL implementation: `/pkgs/core/src/migrations/pgflow--*.sql` (functions: `read_with_poll`, `start_tasks`)

### 2. Empty Array Cascade (DSL + SQL Core)

**What**: When map step receives empty array, entire dependent chain completes without spawning tasks.

**Why**: Prevents infinite waiting on steps that will never have tasks.

**How**:
- DSL: Map steps compiled with `step_type => 'map'`
- SQL Core: `complete_task()` detects array parent completed with `[]`, sets dependent map `initial_tasks=0`
- SQL Core: `cascade_complete_taskless_steps()` completes all `initial_tasks=0` steps in chain (max 50 iterations)

**See**:
- DSL compilation: `/pkgs/dsl/src/compiler/compileFlow.ts`
- Cascade logic: `/pkgs/core/src/migrations/` (function: `cascade_complete_taskless_steps`)

### 3. Realtime Events (SQL Core + Client)

**Flow**: SQL Core → Postgres triggers → Supabase Realtime → Client subscriptions → Application handlers

**Events**:
- `run:started`, `run:completed`, `run:failed`
- `step:started`, `step:completed`, `step:failed`

**See**:
- SQL emission: `/pkgs/core/src/migrations/` (search for `realtime.send()`)
- Client subscription: `/pkgs/client/src/adapters/SupabaseBroadcastAdapter.ts`

### 4. Map Step Types (DSL + SQL Core)

**Root map**:
- DSL: No `array:` property
- SQL Core: `initial_tasks` set at `start_flow()` from input array length

**Dependent map**:
- DSL: Has `array: 'parent_step_slug'`
- SQL Core: `initial_tasks` NULL initially, resolved in `complete_task()` when parent completes

**See**:
- DSL implementation: `/pkgs/dsl/src/flow/Flow.ts` (`.map()` method)
- SQL resolution: `/pkgs/core/src/migrations/` (function: `complete_task`)

---

## Non-Negotiable Conventions

- **Slugs**: `[a-zA-Z_][a-zA-Z0-9_]*`, 1-128 chars (cannot be 'run')
- **DAG Only**: No cycles or conditional edges
- **Topological Order**: Steps added in dependency order (FK enforced)
- **JSON Serializable**: All inputs/outputs must be JSON-compatible
- **Immutable Data**: Inputs and outputs never change after creation

**Validation**: `is_valid_slug()` function in SQL Core

---

## Technology Stack

| Component | Technologies |
|-----------|--------------|
| DSL | TypeScript, JSON Schema |
| SQL Core | PostgreSQL ≥14, pgmq |
| Worker | Deno runtime, postgres.js |
| Platform | Supabase (Edge Functions, Realtime) |
| CLI | Node.js, clack |
| Client | TypeScript, @supabase/supabase-js |
| Monorepo | nx |

---

## Package Locations Quick Reference

```
/pkgs/
├── core/              # SQL Core - PostgreSQL functions, migrations
├── dsl/               # DSL - Flow definition API
│   └── supabase/      # Supabase-specific preset
├── edge-worker/       # Edge Worker - Task executor
├── client/            # Client - Observation API
├── cli/               # CLI - Development tools
├── example-flows/     # Example implementations
└── website/           # Documentation (Starlight)
```

---

## Summary

pgflow achieves reliable workflow orchestration through clear separation of concerns:

- **DSL Layer** - Developer experience and type safety
- **SQL Core Layer** - State management and dependency resolution
- **Edge Worker Layer** - Reliable task execution
- **CLI** - Development tooling
- **Client** - Application integration

Each layer solves its own class of problems without leaking concerns. The database serves as the authoritative source of truth, eliminating the need for external coordinators and enabling horizontal scaling through stateless workers.
