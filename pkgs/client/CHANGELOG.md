# @pgflow/client

## 0.13.2

### Patch Changes

- Updated dependencies [c1ac86c]
  - @pgflow/core@0.13.2
  - @pgflow/dsl@0.13.2

## 0.13.1

### Patch Changes

- Updated dependencies [199fbe1]
  - @pgflow/core@0.13.1
  - @pgflow/dsl@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [05738ed]
  - @pgflow/core@0.13.0
  - @pgflow/dsl@0.13.0

## 0.12.0

### Minor Changes

- 37402eb: BREAKING: Asymmetric handler signatures - remove `run` key from step inputs

  - Root steps: `(flowInput, ctx) => ...` - flow input directly as first param
  - Dependent steps: `(deps, ctx) => ...` - only dependency outputs as first param
  - Access flow input in dependent steps via `await ctx.flowInput` (async/lazy-loaded)
  - Lazy loading prevents data duplication for map steps processing large arrays
  - Enables functional composition and simplifies types for future subflows

### Patch Changes

- d7e77fd: Fix setTimeout context binding issue in SupabaseBroadcastAdapter for browser compatibility
- Updated dependencies [37402eb]
- Updated dependencies [5dc5cfc]
  - @pgflow/core@0.12.0
  - @pgflow/dsl@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [0cb5500]
  - @pgflow/core@0.11.0
  - @pgflow/dsl@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [0b84bb0]
- Updated dependencies [90276ce]
  - @pgflow/core@0.10.0
  - @pgflow/dsl@0.10.0

## 0.9.1

### Patch Changes

- Updated dependencies [992a86b]
  - @pgflow/dsl@0.9.1
  - @pgflow/core@0.9.1

## 0.9.0

### Patch Changes

- @pgflow/core@0.9.0
- @pgflow/dsl@0.9.0

## 0.8.1

### Patch Changes

- f1d3c32: Fix incorrect Supabase CLI version requirement from 2.34.3 to 2.50.3. CLI 2.50.3 is the first version to include pgmq 1.5.0+, which is required for pgflow 0.8.0+.
- Updated dependencies [f1d3c32]
  - @pgflow/core@0.8.1
  - @pgflow/dsl@0.8.1

## 0.8.0

### Minor Changes

- 7380237: BREAKING CHANGE: pgflow 0.8.0 requires pgmq 1.5.0+, PostgreSQL 17, and Supabase CLI 2.50.3+

  This version modernizes infrastructure dependencies and will NOT work with pgmq 1.4.x or earlier. The migration includes a compatibility check that aborts with a clear error message if requirements are not met.

  **Requirements:**

  - pgmq 1.5.0 or higher (previously supported 1.4.x)
  - PostgreSQL 17 (from 15)
  - Supabase CLI 2.50.3 or higher (includes pgmq 1.5.0+)

  **For Supabase users:** Upgrade your Supabase CLI to 2.50.3+ which includes pgmq 1.5.0 by default.

  **For self-hosted users:** Upgrade pgmq to 1.5.0+ and PostgreSQL to 17 before upgrading pgflow.

  **If you cannot upgrade immediately:** Stay on pgflow 0.7.x until your infrastructure is ready. The migration safety check ensures you cannot accidentally upgrade to an incompatible version.

### Patch Changes

- Updated dependencies [7380237]
  - @pgflow/core@0.8.0
  - @pgflow/dsl@0.8.0

## 0.7.3

### Patch Changes

- bde6bed: Add `realtimeStabilizationDelayMs` option to PgflowClient for improved Supabase Realtime reliability
  - @pgflow/core@0.7.3
  - @pgflow/dsl@0.7.3

## 0.7.2

### Patch Changes

- c22a1e5: Fix missing realtime broadcasts for step:started and step:completed events

  **Critical bug fix:** Clients were not receiving `step:started` events when steps transitioned to Started status, and `step:completed` events for empty map steps and cascade completions were also missing.

  **Root cause:** PostgreSQL query optimizer was eliminating CTEs containing `realtime.send()` calls because they were not referenced by subsequent operations or the final RETURN statement.

  **Solution:** Moved `realtime.send()` calls directly into RETURNING clauses of UPDATE statements, ensuring they execute atomically with state changes and cannot be optimized away.

  **Changes:**

  - `start_ready_steps()`: Broadcasts step:started and step:completed events in RETURNING clauses
  - `cascade_complete_taskless_steps()`: Broadcasts step:completed events atomically with cascade completion
  - `complete_task()`: Added PERFORM statements for run:failed and step:failed broadcasts
  - Client: Added `applySnapshot()` methods to FlowRun and FlowStep for proper initial state hydration without event emission

- Updated dependencies [c22a1e5]
  - @pgflow/core@0.7.2
  - @pgflow/dsl@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies [a71b371]
  - @pgflow/core@0.7.1
  - @pgflow/dsl@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies [524db03]
- Updated dependencies [524db03]
- Updated dependencies [524db03]
- Updated dependencies [524db03]
  - @pgflow/dsl@0.7.0
  - @pgflow/core@0.7.0

## 0.6.1

### Patch Changes

- @pgflow/core@0.6.1
- @pgflow/dsl@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [a67bf27]
- Updated dependencies [81d552f]
  - @pgflow/dsl@0.6.0
  - @pgflow/core@0.6.0

## 0.5.4

### Patch Changes

- Updated dependencies [9f219a4]
  - @pgflow/dsl@0.5.4
  - @pgflow/core@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies [af787ff]
  - @pgflow/core@0.5.3
  - @pgflow/dsl@0.5.3

## 0.5.2

### Patch Changes

- @pgflow/core@0.5.2
- @pgflow/dsl@0.5.2

## 0.5.1

### Patch Changes

- @pgflow/core@0.5.1
- @pgflow/dsl@0.5.1

## 0.5.0

### Patch Changes

- @pgflow/core@0.5.0
- @pgflow/dsl@0.5.0

## 0.4.3

### Patch Changes

- Updated dependencies [fa78968]
  - @pgflow/core@0.4.3
  - @pgflow/dsl@0.4.3

## 0.4.2

### Patch Changes

- Updated dependencies [220c867]
  - @pgflow/core@0.4.2
  - @pgflow/dsl@0.4.2

## 0.4.1

### Patch Changes

- 50ab557: feat: add multi-target build support for @pgflow/client package

  The @pgflow/client package now builds for multiple environments, making it usable in Node.js, browsers, and bundlers.

  **What's new:**

  - ES modules (`.js`) and CommonJS (`.cjs`) builds for Node.js
  - Browser bundle (`.browser.js`) with all dependencies included
  - Full TypeScript declarations
  - CDN support via unpkg
  - Production builds with minification
  - Proper tree-shaking support
  - `@supabase/supabase-js` is now a regular dependency (not peer dependency)

  **You can now use it in:**

  - Node.js: `import { PgflowClient } from '@pgflow/client'`
  - CommonJS: `const { PgflowClient } = require('@pgflow/client')`
  - Browser: `<script src="https://unpkg.com/@pgflow/client"></script>` - then use `window.pgflow.createClient(supabase)`
  - Bundlers: Automatically picks the right format

  **Other changes:**

  - Pin Supabase CLI to exact version 2.21.1 to ensure consistent type generation between local and CI environments

- Updated dependencies [50ab557]
  - @pgflow/core@0.4.1
  - @pgflow/dsl@0.4.1

## 0.4.0

### Minor Changes

- 98556d3: Add TypeScript client library for pgflow workflow management

  ## @pgflow/client

  Introduces a new TypeScript client library that provides both event-based and promise-based APIs for interacting with pgflow workflows:

  ### Features

  - **Type-safe workflow management** with full TypeScript support and automatic type inference from flow definitions
  - **Dual API approach**: Choose between event-based subscriptions or promise-based async/await patterns
  - **Real-time monitoring** via Supabase broadcasts with granular event subscriptions
  - **Resource management** with automatic cleanup and disposal
  - **Comprehensive error handling** and recovery mechanisms

  ### Core Components

  - `PgflowClient` - Main client for starting and managing workflow runs
  - `FlowRun` - Monitor and interact with workflow executions
  - `FlowStep` - Track individual step progress and outputs

  ### Example Usage

  ```typescript
  // Start a workflow
  import { PgflowClient } from '@pgflow/client';
  const pgflow = new PgflowClient(supabase);
  const run = await pgflow.startFlow('analyze_website', {
    url: 'https://example.com',
  });

  // Event-based monitoring
  run.on('completed', (event) => {
    console.log('Workflow completed:', event.output);
  });

  // Promise-based monitoring
  const completed = await run.waitForStatus(FlowRunStatus.Completed, {
    timeoutMs: 30000,
  });
  ```

  ## @pgflow/core

  ### Database Enhancements

  - Add `start_flow_with_states()` function to start flows and return complete initial state
  - Add `get_run_with_states()` function to retrieve runs with all step states efficiently
  - Implement `SECURITY DEFINER` functions for secure API access
  - Add real-time broadcast support for workflow state changes

  ## @pgflow/edge-worker

  ### Test Infrastructure Updates

  - Update test database configuration to use standard PostgreSQL credentials
  - Improve test helper functions for database transactions
  - Update Docker Compose configuration for test environment

  ## @pgflow/dsl

  ### Build Configuration

  - Add TypeScript references to tsconfig.spec.json for improved type checking in tests

### Patch Changes

- Updated dependencies [98556d3]
  - @pgflow/core@0.4.0
  - @pgflow/dsl@0.4.0
