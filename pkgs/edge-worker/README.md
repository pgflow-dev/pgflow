# @pgflow/edge-worker

A reliable task queue worker for Supabase Edge Functions that enhances Background Tasks with powerful features.

> [!NOTE]
> This project and all its components are licensed under [Apache 2.0](./LICENSE) license.

## Overview

Edge Worker processes messages from a PostgreSQL queue and executes handler functions in Supabase Edge Functions, with built-in reliability features:

- ⚡ **Reliable Processing** - Automatic retries with configurable delays
- 🔄 **Concurrency Control** - Process multiple tasks in parallel with limits
- 🔁 **Auto Restarts** - Handles Edge Function CPU/memory limits gracefully
- 📈 **Horizontal Scaling** - Deploy multiple instances for the same queue

## Installation

```typescript
// Import directly from JSR in your Edge Function
import { EdgeWorker } from 'jsr:@pgflow/edge-worker';
```

> [!WARNING]
> Always import from JSR.io using the `jsr:` prefix. Never install from npm.

For database setup, see [pgflow installation docs](https://pgflow.dev/getting-started/install-pgflow/).

## Basic Usage

### Simple message processor

You can use Edge Worker as a simple single-handler message processor.
Just pass it a handler function to `.start()`:

```typescript
import { EdgeWorker } from 'jsr:@pgflow/edge-worker';

// Start a worker that processes messages from the 'tasks' queue
EdgeWorker.start(async (payload, context) => {
  console.log('Processing message:', payload);

  // Access platform resources through context
  const result = await context.sql`
    INSERT INTO processed_tasks (data) 
    VALUES (${JSON.stringify(payload)}) 
    RETURNING id
  `;

  return { processed: true, id: result[0].id };
});
```

### Flow step processor

You can also use Edge Worker as a processor for Flow steps.
This will change how it polls and acknowledges messages.
Just pass it a Flow definition to `.start()`:

```typescript
import { EdgeWorker } from 'jsr:@pgflow/edge-worker';
import { Flow } from 'jsr:@pgflow/dsl/supabase';

// Define a flow using Supabase preset for Supabase resources
const AnalyzeWebsite = new Flow<{ url: string }>({
  slug: 'analyzeWebsite',
})
  .step({ slug: 'fetch' }, async (flowInput, context) => {
    // Access Supabase resources through context
    const response = await fetch(flowInput.url, {
      signal: context.shutdownSignal,
    });
    return { html: await response.text() };
  })
  .step({ slug: 'save', dependsOn: ['fetch'] }, async (deps, context) => {
    // Use Supabase client from context
    const { data } = await context.supabase
      .from('websites')
      .insert({ url: context.flowInput.url, html: deps.fetch.html })
      .select()
      .single();
    return data;
  });

// Start the worker
EdgeWorker.start(AnalyzeWebsite);
```

## Context Resources

EdgeWorker automatically provides a context object as the second parameter to all handlers. The context contains platform resources and runtime information.

### Core Resources (Always Available)

These resources are provided regardless of platform:

- **`env`** - Environment variables (`Record<string, string | undefined>`)
- **`shutdownSignal`** - AbortSignal for graceful shutdown handling
- **`rawMessage`** - Original pgmq message with metadata
  ```typescript
  interface PgmqMessageRecord<T> {
    msg_id: number;
    read_ct: number;
    enqueued_at: Date;
    vt: Date;
    message: T;
  }
  ```
- **`stepTask`** - Current step task details (flow handlers only)
  ```typescript
  interface StepTaskRecord<TFlow> {
    flow_slug: string;
    run_id: string;
    step_slug: string;
    input: StepInput<TFlow, StepSlug>;
    msg_id: number;
  }
  ```

### Supabase Platform Resources

When running on Supabase (the default), these additional resources are available:

- **`sql`** - PostgreSQL client (`postgres.Sql`) for database queries
- **`supabase`** - Supabase client (`SupabaseClient`) with service role key for full database access

### Required Environment Variables

The Supabase platform adapter requires these environment variables:

- `EDGE_WORKER_DB_URL` - PostgreSQL connection string (automatically set by Supabase)
- `SUPABASE_URL` - Your Supabase project URL (automatically set)
- `SUPABASE_ANON_KEY` - Anonymous key (automatically set, available for autocomplete)
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (automatically set)
- `SB_EXECUTION_ID` - Execution ID for the Edge Function (automatically set)

All these variables are automatically populated by Supabase Edge Functions runtime.

> [!NOTE]
> While `SUPABASE_ANON_KEY` is required in the environment, the edge worker only uses the service role key for creating the Supabase client.

### Using Context in Handlers

```typescript
// Queue handler with context
EdgeWorker.start(async (payload, context) => {
  // Check environment variables
  if (context.env.FEATURE_FLAG === 'enabled') {
    // Use SQL client
    await context.sql`UPDATE tasks SET processed = true WHERE id = ${payload.id}`;
  }

  // Handle graceful shutdown
  if (context.shutdownSignal.aborted) {
    return { status: 'aborted' };
  }

  // Use Supabase client
  const { data } = await context.supabase
    .from('results')
    .insert({ task_id: payload.id })
    .select();

  return data;
});
```

### Using Supabase Flow Preset for Type Safety

When defining flows that use Supabase resources, import `Flow` from the Supabase preset:

```typescript
import { Flow } from 'jsr:@pgflow/dsl/supabase';

const MyFlow = new Flow<InputType>({ slug: 'myFlow' }).step(
  { slug: 'process' },
  async (input, context) => {
    // TypeScript knows context includes all Supabase resources
    const users = await context.sql`SELECT * FROM users`;
    return users;
  }
);
```

> [!NOTE]
> Context is optional for backward compatibility. Handlers that don't need platform resources can omit the second parameter.

For more details on the context object and available resources, see the [Context documentation](https://github.com/pgflow-org/pgflow/tree/main/pkgs/dsl#context-object).

## Documentation

For complete documentation, visit:

- [pgflow Getting Started](https://pgflow.dev/getting-started/)
- [Edge Worker Documentation (old one)](https://pgflow.dev/edge-worker/getting-started/install-edge-worker/)
- [JSR Package](https://jsr.io/@pgflow/edge-worker)

## Manual E2E Testing

For manual end-to-end testing of edge-worker features, we maintain example edge functions in the `supabase/functions` directory.

### Available Tests

- **[Retry Demo](./supabase/functions/retry-demo/README.md)** - Demonstrates exponential backoff retry mechanism

To run a manual test:

1. Start Supabase: `pnpm nx supabase:start edge-worker`
2. Follow the instructions in the specific test's README

## Dependencies

### PostgreSQL Client

This package uses `jsr:@oscar6echo/postgres` - a JSR-compatible fork of the popular [postgres](https://github.com/porsager/postgres) package.

**Why a fork?** The official `npm:postgres` package uses CommonJS exports (`export =`) which are incompatible with JSR's ES Module requirements. The npm version also fails to parse database URLs correctly in Supabase Edge Runtime, causing `CONNECT_TIMEOUT` errors. See [porsager/postgres#839](https://github.com/porsager/postgres/issues/839) for details.

The fork is functionally identical to postgres v3.4.5, with only the export syntax changed for Deno/JSR compatibility.

## Building

Run `nx build edge-worker` to build the library.
