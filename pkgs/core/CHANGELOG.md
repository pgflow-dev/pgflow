# @pgflow/core

## 0.5.4

### Patch Changes

- Updated dependencies [9f219a4]
  - @pgflow/dsl@0.5.4

## 0.5.3

### Patch Changes

- af787ff: Add `startDelay` option for workflow steps

  Introduces the ability to delay a step's **initial execution** by a specified number of seconds, enabling multi-day workflows and scheduled tasks within pgflow.

  **Important**: `startDelay` only applies to the first execution attempt. Retries use the standard exponential backoff mechanism based on `baseDelay`, not `startDelay`.

  ### Core Changes (@pgflow/core)

  - Added `opt_start_delay` column (integer, nullable, CHECK >= 0) to `pgflow.steps` table
  - Updated `add_step` function to accept and validate the new `start_delay` parameter
  - Modified `start_ready_steps` to schedule initial task execution with delay via `pgmq.send(queue, message, delay)`
  - Requires pgmq >= 0.40 for delay support
  - Migration: `20250707210212_pgflow_add_opt_start_delay.sql`
  - Added comprehensive PgTAP tests for validation and scheduling behavior

  ### DSL Changes (@pgflow/dsl)

  - Extended `StepOptions` and `StepRuntimeOptions` interfaces with optional `startDelay` (in seconds)
  - Updated `compileFlow()` to emit `start_delay => value` in generated SQL
  - Added validation: `startDelay` is only allowed at step level, not flow level (prevents cascading delays)
  - Valid range: 0 to 2,147,483,647 seconds (~68 years)
  - Added unit tests for compilation and validation

  ### Documentation Updates (@pgflow/website)

  - Added `startDelay` section in configuration guide with detailed explanation
  - Created multi-day workflow example (onboarding email sequence)
  - Updated "Update Flow Options" to include `opt_start_delay`
  - Enhanced VS comparison pages to mention "Native step delays" capability
  - Documented why `startDelay` is step-level only

  ### Example Usage

  ```typescript
  new Flow({
    slug: 'user_onboarding',
    maxAttempts: 3,
    baseDelay: 5, // Retry delay (not initial delay)
    timeout: 60,
  })
    .step(
      {
        slug: 'send_welcome_email',
        // Executes immediately when step becomes ready
      },
      sendWelcomeHandler
    )
    .step(
      {
        slug: 'send_day_3_tips',
        startDelay: 259200, // Wait 3 days before first execution
        timeout: 120,
      },
      sendTipsHandler
    )
    .step(
      {
        slug: 'send_week_review',
        startDelay: 604800, // Wait 7 days after dependencies complete
        timeout: 120,
      },
      sendReviewHandler
    );
  ```

  ### Use Cases

  - **Multi-day workflows**: Onboarding sequences, follow-up reminders
  - **Scheduled notifications**: Send reports or alerts at specific intervals
  - **Rate limiting**: Enforce minimum time between API calls
  - **Compliance delays**: Cooling-off periods before actions

  ### Technical Notes

  - Non-breaking, additive change (hence minor version bump)
  - No changes required in `@pgflow/edge-worker` - delays handled by pgmq
  - `startDelay` does not affect retry timing - only the initial execution
  - Delays are reliable even across worker restarts (persisted in queue)

- Updated dependencies [af787ff]
  - @pgflow/dsl@0.5.3

## 0.5.2

### Patch Changes

- @pgflow/dsl@0.5.2

## 0.5.1

### Patch Changes

- @pgflow/dsl@0.5.1

## 0.5.0

### Patch Changes

- @pgflow/dsl@0.5.0

## 0.4.3

### Patch Changes

- fa78968: Fix Supabase Security Advisor warnings by setting empty search_path on functions
  - @pgflow/dsl@0.4.3

## 0.4.2

### Patch Changes

- 220c867: Fix step:failed events not being broadcast when steps fail

  Fixed a bug where step:failed events were not being broadcast to real-time subscribers when a step failed permanently. The issue was caused by PostgreSQL optimizing away the CTE that contained the realtime.send() call. The fix replaces the CTE approach with a direct PERFORM statement in the function body, ensuring the event is always sent when a step fails.

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
  - @pgflow/dsl@0.4.0

## 0.3.1

### Patch Changes

- d08fd2d: Optimize message visibility timeout updates with batch operations

  - Added `pgflow.set_vt_batch()` function to update multiple message visibility timeouts in a single database call
  - Replaced individual `pgmq.set_vt()` calls in `start_tasks()` with efficient batch updates
  - Reduces database round-trips from N calls to 1 call when starting N tasks
  - Improves performance and reduces database load during high-throughput task processing
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

- @pgflow/dsl@0.3.0

## 0.2.6

### Patch Changes

- @pgflow/dsl@0.2.6

## 0.2.5

### Patch Changes

- @pgflow/dsl@0.2.5

## 0.2.4

### Patch Changes

- 2f13e8b: Fix `poll_for_tasks` latency

  The previous implementation were calling `read_with_poll` in same statement
  as the `SELECT FROM step_tasks`, which resulted in new tasks that were inserted
  after the `read_with_poll` started were not discovered as those were not visible
  in the statement.

  Now `poll_for_tasks` is split to separate statements so step tasks created
  during the `poll_for_tasks` will be immediately picked up.

  - @pgflow/dsl@0.2.4

## 0.2.3

### Patch Changes

- @pgflow/dsl@0.2.3

## 0.2.2

### Patch Changes

- @pgflow/dsl@0.2.2

## 0.2.1

### Patch Changes

- d553c07: Fix critical migration error that prevented installing if PGMQ was installed previously
- Updated dependencies [3f3174e]
  - @pgflow/dsl@0.2.1

## 0.2.0

### Patch Changes

- @pgflow/dsl@0.2.0

## 0.1.23

### Patch Changes

- @pgflow/dsl@0.1.23

## 0.1.22

### Patch Changes

- Updated dependencies [8f6eb3d]
  - @pgflow/dsl@0.1.22

## 0.1.21

### Patch Changes

- ea1ce78: Make visibilityTimeout the last option to pollForTasks so it can be skipped
  - @pgflow/dsl@0.1.21

## 0.1.20

### Patch Changes

- 09e3210: Change name of initial migration :-(
- 985176e: Add step_index to steps and various status timestamps to runtime tables
  - @pgflow/dsl@0.1.20

## 0.1.19

### Patch Changes

- a10b442: Add minimum set of indexes
- efbd108: Convert migrations to declarative schemas and generate initial migration
  - @pgflow/dsl@0.1.19

## 0.1.18

### Patch Changes

- 3a7e132: Do not build edge-worker for npm
- Updated dependencies [3a7e132]
  - @pgflow/dsl@0.1.18

## 0.1.17

### Patch Changes

- d215ed2: Trigger version change
- Updated dependencies [d215ed2]
  - @pgflow/dsl@0.1.17

## 0.1.16

### Patch Changes

- cc7c431: Test release to verify combined publishing of both npm and jsr packages
- Updated dependencies [cc7c431]
  - @pgflow/dsl@0.1.16

## 0.1.15

### Patch Changes

- ce34a2c: Update release pipeline to publish to jsr
- Updated dependencies [ce34a2c]
  - @pgflow/dsl@0.1.15

## 0.1.14

### Patch Changes

- @pgflow/dsl@0.1.14

## 0.1.13

### Patch Changes

- @pgflow/dsl@0.1.13

## 0.1.12

### Patch Changes

- Updated dependencies [7b1328e]
  - @pgflow/dsl@0.1.12

## 0.1.11

### Patch Changes

- @pgflow/dsl@0.1.11

## 0.1.10

### Patch Changes

- bafe767: Fix deno/ folder for cli being missing
- Updated dependencies [bafe767]
  - @pgflow/dsl@0.1.10

## 0.1.9

### Patch Changes

- 1a30c6c: Make sure to tag and push tags
- Updated dependencies [1a30c6c]
  - @pgflow/dsl@0.1.9

## 0.1.8

### Patch Changes

- 05f5bd8: Update release script
- Updated dependencies [05f5bd8]
  - @pgflow/dsl@0.1.8

## 0.1.7

### Patch Changes

- summary
  - @pgflow/dsl@0.1.7

## 0.1.6

### Patch Changes

- Test release to verify problem with bumping edge-worker
- Updated dependencies
  - @pgflow/dsl@0.1.6

## 0.1.5

### Patch Changes

- 5820e7a: Bump version for tests
- Updated dependencies [5820e7a]
  - @pgflow/dsl@0.1.5

## 0.1.4

### Patch Changes

- @pgflow/dsl@0.1.4

## 0.1.3

### Patch Changes

- @pgflow/dsl@0.1.3

## 0.1.2

### Patch Changes

- @pgflow/dsl@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [b362364]
  - @pgflow/dsl@0.1.1

## 0.1.0

### Minor Changes

- 7c40238: fix migration files to not set `search_path`

### Patch Changes

- @pgflow/dsl@0.1.0

## 0.0.23

### Patch Changes

- @pgflow/dsl@0.0.23

## 0.0.22

### Patch Changes

- @pgflow/dsl@0.0.22

## 0.0.21

### Patch Changes

- @pgflow/dsl@0.0.21

## 0.0.20

### Patch Changes

- @pgflow/dsl@0.0.20

## 0.0.19

### Patch Changes

- 042bc64: Move migrations to pkgs/core
  - @pgflow/dsl@0.0.19

## 0.0.18

### Patch Changes

- 53abf4a: Fix pnpm issues with linking to dist/
- Updated dependencies [53abf4a]
  - @pgflow/dsl@0.0.18

## 0.0.17

### Patch Changes

- @pgflow/dsl@0.0.17

## 0.0.16

### Patch Changes

- @pgflow/dsl@0.0.16

## 0.0.15

### Patch Changes

- @pgflow/dsl@0.0.15

## 0.0.14

### Patch Changes

- @pgflow/dsl@0.0.14

## 0.0.13

### Patch Changes

- @pgflow/dsl@0.0.13

## 0.0.12

### Patch Changes

- @pgflow/dsl@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies [17937e3]
  - @pgflow/dsl@0.0.11

## 0.0.10

### Patch Changes

- @pgflow/dsl@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies [70d3f2d]
  - @pgflow/dsl@0.0.9

## 0.0.8

### Patch Changes

- @pgflow/dsl@0.0.8

## 0.0.7

### Patch Changes

- 7c83db9: Add release-related options to package.json files
- Updated dependencies [7c83db9]
  - @pgflow/dsl@0.0.7

## 0.0.6

### Patch Changes

- @pgflow/dsl@0.0.6

## 0.0.5

### Patch Changes

- 196f7d8: Test patch bump
- Updated dependencies [b4b0809]
  - @pgflow/dsl@0.0.5
