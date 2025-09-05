# @pgflow/client

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
