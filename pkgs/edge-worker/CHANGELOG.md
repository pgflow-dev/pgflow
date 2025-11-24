# @pgflow/edge-worker

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

- @pgflow/core@0.7.3
- @pgflow/dsl@0.7.3

## 0.7.2

### Patch Changes

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

- ac8a858: Add workerConfig to handler execution context

  Handlers can now access worker configuration through `context.workerConfig` to make intelligent decisions based on retry limits, concurrency settings, and other worker parameters. The config is deeply frozen to prevent accidental modifications while remaining mutable by the worker itself for future features.

  Key improvements:

  - Added `workerConfig` to MessageExecution and StepTaskExecution contexts
  - Config is cached and frozen once at startup for optimal performance
  - Reorganized configuration handling with cleaner factory methods
  - Simplified EdgeWorker API by removing unnecessary union types
  - Environment variables always sourced from platform (users cannot override)

- 51b41f2: Fix retry config validation to only enforce limit <= 50 for exponential strategy, allowing higher limits for fixed strategy
  - @pgflow/core@0.6.1
  - @pgflow/dsl@0.6.1

## 0.6.0

### Minor Changes

- a67bf27: 🚨 **BREAKING**: Remove `anonSupabase` and `serviceSupabase` from context, replaced with single `supabase` client (initialized with service role key)

  The dual-client approach was unnecessary complexity. Edge Functions run in a trusted environment with service role access, so a single client is sufficient.

  **Migration guide**:

  ```typescript
  // Before
  const { data } = await context.serviceSupabase.from('users').select();
  const { data: publicData } = await context.anonSupabase
    .from('posts')
    .select();

  // After
  const { data } = await context.supabase.from('users').select();
  // For RLS-respecting queries, implement proper policies in your database
  ```

  ⚠️ **Breaking changes**:

  - Removed `anonSupabase` from context interface
  - Removed `serviceSupabase` from context interface
  - Added `supabase` field (initialized with service role key)
  - Removed `createAnonSupabaseClient` function

### Patch Changes

- 81d552f: Implement worker deprecation for graceful shutdowns

  - Add deprecation support to enable zero-downtime deployments
  - Workers now check deprecation status via heartbeat and stop accepting new work when deprecated
  - Repurpose unused `stopped_at` column as `deprecated_at` for tracking deprecation timestamps
  - Refactor heartbeat logic directly into lifecycle classes for improved type safety
  - Add configurable heartbeat interval (default: 5 seconds)
  - Workers complete in-flight work before shutting down when deprecated

- Updated dependencies [a67bf27]
- Updated dependencies [81d552f]
  - @pgflow/dsl@0.6.0
  - @pgflow/core@0.6.0

## 0.5.4

### Patch Changes

- 9f219a4: Remove PlatformAdapter from EdgeWorker.start() return type

  The `EdgeWorker.start()` method now returns `Promise<void>` instead of `Promise<PlatformAdapter>`. The PlatformAdapter was never intended to be part of the public API and was accidentally exposed. This change properly encapsulates the internal implementation details.

  **Breaking Change**: If you were using the returned PlatformAdapter (which was undocumented), you'll need to refactor your code. However, this is unlikely as the EdgeWorker is designed to be started and run without further interaction.

- 9f219a4: Add context object as second parameter to handlers

  Queue and flow handlers now receive an optional context parameter that provides platform resources like database connections, environment variables, and Supabase clients - eliminating boilerplate and connection management.

  ```typescript
  // Queue handler
  EdgeWorker.start(async (payload, context) => {
    await context.sql`INSERT INTO tasks (data) VALUES (${payload})`;
  });

  // Flow step handler
  .step({ slug: 'process' }, async (input, context) => {
    const result = await context.serviceSupabase.from('users').select();
  })
  ```

  **Core resources** (always available):

  - `context.env` - Environment variables
  - `context.shutdownSignal` - AbortSignal for graceful shutdown
  - `context.rawMessage` - Original pgmq message with metadata
  - `context.stepTask` - Current step task details (flow handlers only)

  **Supabase platform resources**:

  - `context.sql` - PostgreSQL client (postgres.js)
  - `context.anonSupabase` - Supabase client with anonymous key
  - `context.serviceSupabase` - Supabase client with service role key

  To use Supabase resources in flows, import from the Supabase preset:

  ```typescript
  import { Flow } from '@pgflow/dsl/supabase';
  ```

  The context parameter is optional for backward compatibility - existing single-parameter handlers continue to work unchanged.

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

- d9fbe85: Refine task logging levels for better visibility

  - Move detailed execution logs from ExecutionController to MessageExecutor
  - Demote controller-level logs from info to debug
  - Promote task execution, retry, and error logs from debug to appropriate levels (info/error)
  - Improve visibility of task lifecycle events and failures
  - @pgflow/core@0.5.2
  - @pgflow/dsl@0.5.2

## 0.5.1

### Patch Changes

- c9c4eb6: Improve EdgeWorker debug logging and error handling

  - Fix consistent usage of log severity levels (debug, info, error) across the worker
  - Move non-essential logs to debug level to reduce noise in production
  - Move execution results to appropriate info/error levels
  - Fix log_level to properly default to 'info' instead of crashing on startup
  - Update documentation URL that was returning 404
  - Refactor getEnvVar to be properly typed with default value support
  - Fix linting errors in retry-demo (remove unnecessary async, replace any with unknown)
  - @pgflow/core@0.5.1
  - @pgflow/dsl@0.5.1

## 0.5.0

### Minor Changes

- 6181c58: Add retry strategies with exponential backoff support

  Edge Worker now supports configurable retry strategies through a new `retry` configuration object. You can choose between exponential backoff (recommended) or fixed delays.

  ### Features

  - **Exponential backoff**: Delays double with each retry (3s, 6s, 12s...)
  - **Fixed delays**: Constant delay between retries
  - **Configurable limits**: Set max attempts and delay caps
  - **Backwards compatible**: Old `retryLimit`/`retryDelay` fields still work with deprecation warnings

  ### 💥 Breaking Change

  The default retry strategy changed from fixed to exponential backoff. If you rely on fixed delays, update your config:

  ```ts
  // Before (implicit fixed delay)
  EdgeWorker.start(handler, {
    retryLimit: 5,
    retryDelay: 3,
  });

  // After (explicit fixed delay)
  EdgeWorker.start(handler, {
    retry: {
      strategy: 'fixed',
      limit: 5,
      baseDelay: 3,
    },
  });

  // Or use the new default (exponential)
  EdgeWorker.start(handler, {
    retry: {
      strategy: 'exponential',
      limit: 5,
      baseDelay: 3,
      maxDelay: 300,
    },
  });
  ```

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

- Updated dependencies [50ab557]
  - @pgflow/core@0.4.1
  - @pgflow/dsl@0.4.1

## 0.4.0

### Patch Changes

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

- Updated dependencies [98556d3]
  - @pgflow/core@0.4.0
  - @pgflow/dsl@0.4.0

## 0.3.1

### Patch Changes

- 33bbdce: Add internal exports for experimental use

  Expose internal components through a new `_internal` export path to enable experimentation with alternative worker architectures. These APIs are unstable and may change without notice. The internal exports are organized by namespace (core, platform, flow, queue) for better discoverability.

  **⚠️ WARNING: These internal APIs are subject to change without notice. Import from `_internal` at your own risk!**

- Updated dependencies [d08fd2d]
  - @pgflow/core@0.3.1
  - @pgflow/dsl@0.3.1

## 0.3.0

### Minor Changes

- c3653fa: Replace single-phase polling with two-phase approach to eliminate race conditions

  **Breaking Change**: The `poll_for_tasks` function is now deprecated and returns an empty set. Edge workers must be updated to use the new two-phase polling mechanism.

  **What Changed:**

  - Added new "started" status for step_tasks with `started_at` timestamp and `last_worker_id` tracking
  - Introduced `start_tasks` function for the second phase of task processing
  - Edge worker now uses two-phase approach: first `read_with_poll` to get messages, then `start_tasks` to process them
  - This eliminates race conditions where tasks might not be visible when processing messages

  **Migration Instructions:**

  1. Run `npx pgflow install` to apply database migrations and update dependencies
  2. Redeploy your edge workers - they will automatically use the new polling mechanism
  3. Old workers will continue running but won't process any tasks (safe degradation)

  **Why This Change:**
  The previous `poll_for_tasks` had subtle race conditions on slower systems where messages could be read but matching step_tasks weren't visible in the same transaction, leading to lost work. The new two-phase approach provides stronger guarantees and better observability.

### Patch Changes

- Updated dependencies [c3653fa]
  - @pgflow/core@0.3.0
  - @pgflow/dsl@0.3.0

## 0.2.6

### Patch Changes

- @pgflow/core@0.2.6
- @pgflow/dsl@0.2.6

## 0.2.5

### Patch Changes

- @pgflow/core@0.2.5
- @pgflow/dsl@0.2.5

## 0.2.4

### Patch Changes

- Updated dependencies [2f13e8b]
  - @pgflow/core@0.2.4
  - @pgflow/dsl@0.2.4

## 0.2.3

### Patch Changes

- b0cd6bc: Update visibilityTimeout default value to 10s for queue-based worker
  - @pgflow/core@0.2.3
  - @pgflow/dsl@0.2.3

## 0.2.2

### Patch Changes

- @pgflow/core@0.2.2
- @pgflow/dsl@0.2.2

## 0.2.1

### Patch Changes

- 3f3174e: Update the README's
- Updated dependencies [d553c07]
- Updated dependencies [3f3174e]
  - @pgflow/core@0.2.1
  - @pgflow/dsl@0.2.1

## 0.2.0

### Patch Changes

- @pgflow/core@0.2.0
- @pgflow/dsl@0.2.0

## 0.1.23

### Patch Changes

- @pgflow/core@0.1.23
- @pgflow/dsl@0.1.23

## 0.1.22

### Patch Changes

- Updated dependencies [8f6eb3d]
  - @pgflow/dsl@0.1.22
  - @pgflow/core@0.1.22

## 0.1.21

### Patch Changes

- ea1ce78: Make worker.stop() wait for the main loop promise
- Updated dependencies [ea1ce78]
  - @pgflow/core@0.1.21
  - @pgflow/dsl@0.1.21

## 0.1.20

### Patch Changes

- Updated dependencies [09e3210]
- Updated dependencies [985176e]
  - @pgflow/core@0.1.20
  - @pgflow/dsl@0.1.20

## 0.1.19

### Patch Changes

- efbd108: Convert migrations to declarative schemas and generate initial migration
- Updated dependencies [a10b442]
- Updated dependencies [efbd108]
  - @pgflow/core@0.1.19
  - @pgflow/dsl@0.1.19

## 0.1.18

### Patch Changes

- 3a7e132: Do not build edge-worker for npm
- Updated dependencies [3a7e132]
  - @pgflow/core@0.1.18
  - @pgflow/dsl@0.1.18

## 0.1.17

### Patch Changes

- d215ed2: Trigger version change
- Updated dependencies [d215ed2]
  - @pgflow/core@0.1.17
  - @pgflow/dsl@0.1.17

## 0.1.16

### Patch Changes

- cc7c431: Test release to verify combined publishing of both npm and jsr packages
- Updated dependencies [cc7c431]
  - @pgflow/core@0.1.16
  - @pgflow/dsl@0.1.16

## 0.1.15

### Patch Changes

- ce34a2c: Update release pipeline to publish to jsr
- Updated dependencies [ce34a2c]
  - @pgflow/core@0.1.15
  - @pgflow/dsl@0.1.15

## 0.1.14

### Patch Changes

- 956224b: Add debug statements in EdgeWorker
  - @pgflow/core@0.1.14
  - @pgflow/dsl@0.1.14

## 0.1.13

### Patch Changes

- 2a2a7bc: Add debug statements to find logger issue
  - @pgflow/core@0.1.13
  - @pgflow/dsl@0.1.13

## 0.1.12

### Patch Changes

- Updated dependencies [7b1328e]
  - @pgflow/dsl@0.1.12
  - @pgflow/core@0.1.12

## 0.1.11

### Patch Changes

- @pgflow/core@0.1.11
- @pgflow/dsl@0.1.11

## 0.1.10

### Patch Changes

- bafe767: Fix deno/ folder for cli being missing
- Updated dependencies [bafe767]
  - @pgflow/core@0.1.10
  - @pgflow/dsl@0.1.10

## 0.1.9

### Patch Changes

- 1a30c6c: Make sure to tag and push tags
- Updated dependencies [1a30c6c]
  - @pgflow/core@0.1.9
  - @pgflow/dsl@0.1.9

## 0.1.8

### Patch Changes

- 05f5bd8: Update release script
- Updated dependencies [05f5bd8]
  - @pgflow/core@0.1.8
  - @pgflow/dsl@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies
  - @pgflow/core@0.1.7
  - @pgflow/dsl@0.1.7

## 0.1.6

### Patch Changes

- Test release to verify problem with bumping edge-worker
- Updated dependencies
  - @pgflow/core@0.1.6
  - @pgflow/dsl@0.1.6

## 0.1.5

### Patch Changes

- 5820e7a: Bump version for tests
- Updated dependencies [5820e7a]
  - @pgflow/core@0.1.5
  - @pgflow/dsl@0.1.5

## 0.1.4

### Patch Changes

- @pgflow/core@0.1.4
- @pgflow/dsl@0.1.4

## 0.1.3

### Patch Changes

- @pgflow/core@0.1.3
- @pgflow/dsl@0.1.3

## 0.1.2

### Patch Changes

- @pgflow/core@0.1.2
- @pgflow/dsl@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [b362364]
  - @pgflow/dsl@0.1.1
  - @pgflow/core@0.1.1

## 0.1.0

### Patch Changes

- Updated dependencies [7c40238]
  - @pgflow/core@0.1.0
  - @pgflow/dsl@0.1.0

## 0.0.23

### Patch Changes

- @pgflow/core@0.0.23
- @pgflow/dsl@0.0.23

## 0.0.22

### Patch Changes

- @pgflow/core@0.0.22
- @pgflow/dsl@0.0.22

## 0.0.21

### Patch Changes

- @pgflow/core@0.0.21
- @pgflow/dsl@0.0.21

## 0.0.20

### Patch Changes

- @pgflow/core@0.0.20
- @pgflow/dsl@0.0.20

## 0.0.19

### Patch Changes

- Updated dependencies [042bc64]
  - @pgflow/core@0.0.19
  - @pgflow/dsl@0.0.19

## 0.0.18

### Patch Changes

- 53abf4a: Fix pnpm issues with linking to dist/
- Updated dependencies [53abf4a]
  - @pgflow/core@0.0.18
  - @pgflow/dsl@0.0.18

## 0.0.17

### Patch Changes

- @pgflow/core@0.0.17
- @pgflow/dsl@0.0.17

## 0.0.16

### Patch Changes

- @pgflow/core@0.0.16
- @pgflow/dsl@0.0.16

## 0.0.15

### Patch Changes

- @pgflow/core@0.0.15
- @pgflow/dsl@0.0.15

## 0.0.14

### Patch Changes

- @pgflow/core@0.0.14
- @pgflow/dsl@0.0.14

## 0.0.13

### Patch Changes

- @pgflow/core@0.0.13
- @pgflow/dsl@0.0.13

## 0.0.12

### Patch Changes

- @pgflow/core@0.0.12
- @pgflow/dsl@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies [17937e3]
  - @pgflow/dsl@0.0.11
  - @pgflow/core@0.0.11

## 0.0.10

### Patch Changes

- Release again on NPM
  - @pgflow/core@0.0.10
  - @pgflow/dsl@0.0.10

## 0.0.9

### Patch Changes

- 8786acf: Test jsr publish again
- Updated dependencies [70d3f2d]
  - @pgflow/dsl@0.0.9
  - @pgflow/core@0.0.9

## 0.0.8

### Patch Changes

- Test jsr version writing
  - @pgflow/core@0.0.8
  - @pgflow/dsl@0.0.8

## 0.0.7

### Patch Changes

- 7c83db9: Add release-related options to package.json files
- Updated dependencies [7c83db9]
  - @pgflow/core@0.0.7
  - @pgflow/dsl@0.0.7

## 0.0.6

### Patch Changes

- 9dd4676: Update package.json configuration
  - @pgflow/core@0.0.6
  - @pgflow/dsl@0.0.6

## 0.0.5

### Patch Changes

- Updated dependencies [196f7d8]
- Updated dependencies [b4b0809]
  - @pgflow/core@0.0.5
  - @pgflow/dsl@0.0.5
