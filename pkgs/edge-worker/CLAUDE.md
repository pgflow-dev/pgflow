# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ PROJECT NAMING CONVENTION ⚠️

**IMPORTANT**: The name of the project should only ever be used as lowercase: **pgflow**

Never use:

- pgFlow
- PgFlow
- Pgflow
- PGFlow

The only exception is in class names, where "Pgflow" can be used (PascalCase).

## Overview

The `@pgflow/edge-worker` package provides a reliable task queue worker for Supabase Edge Functions that enhances Background Tasks with powerful features like automatic retries, concurrency control, auto restarts, and horizontal scaling.

This package is part of the pgflow ecosystem, which is a PostgreSQL-native workflow engine for defining, managing, and tracking DAG-based workflows.

## Architecture

Edge Worker is Layer 3 in the pgflow architecture:

1. **Layer 1: Definition (DSL)** - TypeScript API for defining flows (`@pgflow/dsl`)
2. **Layer 2: Orchestration (SQL Core)** - Pure SQL tables, constraints, functions, triggers
3. **Layer 3: Execution (Edge Worker)** - A Node/Deno script that polls the queue and executes handlers

The Edge Worker:

- Polls pgmq queue via `poll_for_tasks`
- Executes handler functions
- Calls back `complete_task` / `fail_task`
- Supports auto-restarts, horizontal scaling, and has no local state

## Key Files

- `EdgeWorker.ts` - Main entry point for creating and starting edge workers
- `core/` - Core components like BatchProcessor, Heartbeat, Worker, etc.
- `flow/` - Flow-specific implementations for executing steps in a workflow
- `queue/` - Queue-specific implementations for processing messages
- `platform/` - Platform adapters for different execution environments (Deno)

## Build/Test Commands

- `pnpm nx test edge-worker` - Run all tests
- `pnpm nx test:unit edge-worker` - Run unit tests
- `pnpm nx test:integration edge-worker` - Run integration tests
- `pnpm nx lint edge-worker` - Run linting

## Testing

The package has different test types:

- **Unit tests** (`tests/unit/`) - For testing isolated components
- **Integration tests** (`tests/integration/`) - For testing integration with PostgreSQL
- **E2E tests** (`tests/e2e/`) - For testing end-to-end workflows (not automated for now)

Tests use Deno's built-in testing framework. Database tests require Docker to run a PostgreSQL instance.

## Usage Examples

### Queue Worker

```typescript
import { EdgeWorker } from 'jsr:@pgflow/edge-worker';

EdgeWorker.start(
  async (payload) => {
    console.log('Processing message:', payload);

    // Your processing logic here...
    const result = await processPayload(payload);

    return result; // Optional
  },
  {
    queueName: 'tasks',
    maxConcurrent: 10,
    maxPgConnections: 4,
    maxPollSeconds: 5,
    pollIntervalMs: 200,
    retryDelay: 5,
    retryLimit: 5,
    visibilityTimeout: 10,
  }
);
```

### Flow Worker

```typescript
import { EdgeWorker } from 'jsr:@pgflow/edge-worker';
import MyFlow from '../_flows/my_flow.ts';

EdgeWorker.start(MyFlow, {
  maxConcurrent: 10,
  maxPgConnections: 4,
  batchSize: 10,
  maxPollSeconds: 2,
  pollIntervalMs: 100,
});
```

## Package Dependencies

This package depends on:

- `@pgflow/core` - Core PostgreSQL functions and types
- `@pgflow/dsl` - TypeScript DSL for defining workflows
- `@henrygd/queue` - Queue implementation
- `postgres` - PostgreSQL client

## Important Notes

1. The package is designed for Supabase Edge Functions and Deno
1. Always follow the single-responsibility principle when adding new functionality
1. Keep Edge Worker lightweight - heavy logic should go in the SQL Core (Layer 2)
1. When adding configuration options, provide sensible defaults
1. Remember that Edge Worker is stateless and can restart at any time
1. Follow TypeScript strict mode with proper type annotations

## Development Workflow

1. Make changes to TypeScript files in the `src/` directory
2. Run `pnpm nx lint edge-worker` to check for linting issues
3. Run `pnpm nx build edge-worker` to build the package
4. Submit PR with changes
