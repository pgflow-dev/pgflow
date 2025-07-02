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
EdgeWorker.start(async (payload) => {
  console.log('Processing message:', payload);

  // Your processing logic here...
  const result = await processPayload(payload);

  return result; // Optional
});
```

### Flow step processor

You can also use Edge Worker as a processor for Flow steps.
This will change how it polls and acknowledges messages.
Just pass it a Flow definition to `.start()`:

```typescript
import { EdgeWorker } from 'jsr:@pgflow/edge-worker';
import AnalyzeWebsite from '../_flows/analyze_website.ts';

// Start a worker that processes messages from the 'analyze_website' queue
EdgeWorker.start(AnalyzeWebsite);
```

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

## Building

Run `nx build edge-worker` to build the library.
