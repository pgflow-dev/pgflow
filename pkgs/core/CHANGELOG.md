# @pgflow/core

## 0.12.0

### Minor Changes

- 37402eb: BREAKING: Asymmetric handler signatures - remove `run` key from step inputs

  - Root steps: `(flowInput, ctx) => ...` - flow input directly as first param
  - Dependent steps: `(deps, ctx) => ...` - only dependency outputs as first param
  - Access flow input in dependent steps via `await ctx.flowInput` (async/lazy-loaded)
  - Lazy loading prevents data duplication for map steps processing large arrays
  - Enables functional composition and simplifies types for future subflows

### Patch Changes

- Updated dependencies [37402eb]
- Updated dependencies [5dc5cfc]
  - @pgflow/dsl@0.12.0

## 0.11.0

### Minor Changes

- 0cb5500: New compilation config with allowDataLoss option for rapid iteration platforms. Breaking: ensureCompiledOnStartup removed in favor of compilation option.

### Patch Changes

- @pgflow/dsl@0.11.0

## 0.10.0

### Minor Changes

- 90276ce: Add automatic worker restart via `ensure_workers()` cron job that keeps edge functions running. Add `worker_functions` table for tracking registered edge functions and their health status. Add `stopped_at` column to workers table for graceful shutdown detection. Integrate `trackWorkerFunction` and `markWorkerStopped` into edge worker lifecycle for automatic registration and shutdown signaling.

### Patch Changes

- 0b84bb0: Add automatic flow compilation at worker startup. Workers now call ensure_flow_compiled to verify flows are up-to-date. In development, mismatched flows are recompiled automatically. In production, mismatches cause errors. Use ensureCompiledOnStartup: false to opt-out.
- Updated dependencies [0b84bb0]
  - @pgflow/dsl@0.10.0

## 0.9.1

### Patch Changes

- Updated dependencies [992a86b]
  - @pgflow/dsl@0.9.1

## 0.9.0

### Patch Changes

- @pgflow/dsl@0.9.0

## 0.8.1

### Patch Changes

- f1d3c32: Fix incorrect Supabase CLI version requirement from 2.34.3 to 2.50.3. CLI 2.50.3 is the first version to include pgmq 1.5.0+, which is required for pgflow 0.8.0+.
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

- @pgflow/dsl@0.8.0

## 0.7.3

### Patch Changes

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
  - @pgflow/dsl@0.7.2

## 0.7.1

### Patch Changes

- a71b371: Fix installation failures on new Supabase projects by removing pgmq version pin.

  Supabase upgraded to pgmq 1.5.1 in Postgres 17.6.1.016+ (https://github.com/supabase/postgres/pull/1668), but pgflow was pinned to 1.4.4, causing "extension has no installation script" errors on fresh instances.

  Only affects new projects - existing installations are unaffected and require no action.

  Thanks to @kallebysantos for reporting this issue!

  - @pgflow/dsl@0.7.1

## 0.7.0

### Minor Changes

- 524db03: Add map step type infrastructure in SQL core

  ⚠️ **This migration includes automatic data migration**

  The migration will automatically update existing `step_states` rows to satisfy new constraints. This should complete without issues due to strict check constraints enforced in previous versions.

  💡 **Recommended: Verify before deploying to production**

  If you have existing production data and want to verify the migration will succeed cleanly, run this **read-only check query** (does not modify data) in **Supabase Studio** against your **production database**:

  1. Open Supabase Studio → SQL Editor
  2. Copy contents of `pkgs/core/queries/PRE_MIGRATION_CHECK_20251006073122.sql`
  3. Execute against your production database (not local dev!)
  4. Review results

  **Expected output for successful migration:**

  ```
  type                       | identifier                | details
  ---------------------------|---------------------------|------------------------------------------
  DATA_BACKFILL_STARTED      | run=def67890 step=process | initial_tasks will be set to 1 (...)
  DATA_BACKFILL_COMPLETED    | Found 100 completed steps | initial_tasks will be set to 1 (...)
  INFO_SUMMARY               | total_step_states=114     | created=0 started=1 completed=113 failed=0
  ```

  **Interpretation:**

  - ✅ Only `DATA_BACKFILL_*` and `INFO_SUMMARY` rows? **Safe to migrate**
  - ⚠️ These are expected data migrations handled automatically by the migration
  - 🆘 Unexpected rows or errors? Copy output and share on Discord for help

  📝 **Note:** This check identifies data that needs migration but does not modify anything. Only useful for production databases with existing runs.

  **Automatic data updates:**

  - Sets `initial_tasks = 1` for all existing steps (correct for pre-map-step schema)
  - Sets `remaining_tasks = NULL` for 'created' status steps (new semantics)

  No manual intervention required.

  ***

  ## Changes

  This patch introduces the foundation for map step functionality in the SQL core layer:

  ### Schema Changes

  - Added `step_type` column to `steps` table with constraint allowing 'single' or 'map' values
  - Added `initial_tasks` column to `step_states` table (defaults to 1, stores planned task count)
  - Modified `remaining_tasks` column to be nullable (NULL = not started, >0 = active countdown)
  - Added constraint `remaining_tasks_state_consistency` to ensure `remaining_tasks` is only set when step has started
  - Removed `only_single_task_per_step` constraint from `step_tasks` table to allow multiple tasks per step

  ### Function Updates

  - **`add_step()`**: Now accepts `step_type` parameter (defaults to 'single') with validation that map steps can have at most 1 dependency
  - **`start_flow()`**: Sets `initial_tasks = 1` for all steps (map step array handling will come in future phases)
  - **`start_ready_steps()`**: Copies `initial_tasks` to `remaining_tasks` when starting a step, maintaining proper task counting semantics

  ### Testing

  - Added comprehensive test coverage for map step creation and validation
  - All existing tests pass with the new schema changes
  - Tests validate the new step_type parameter and dependency constraints for map steps

  This is Phase 2a of the map step implementation, establishing the SQL infrastructure needed for parallel task execution in future phases.

### Patch Changes

- 524db03: Improve failure handling and prevent orphaned messages in queue

  - Archive all queued messages when a run fails to prevent resource waste
  - Handle type constraint violations gracefully without exceptions
  - Store output on failed tasks (including type violations) for debugging
  - Add performance index for efficient message archiving
  - Prevent retries on already-failed runs
  - Update table constraint to allow output storage on failed tasks

- Updated dependencies [524db03]
- Updated dependencies [524db03]
  - @pgflow/dsl@0.7.0

## 0.6.1

### Patch Changes

- @pgflow/dsl@0.6.1

## 0.6.0

### Patch Changes

- 81d552f: Implement worker deprecation for graceful shutdowns

  - Add deprecation support to enable zero-downtime deployments
  - Workers now check deprecation status via heartbeat and stop accepting new work when deprecated
  - Repurpose unused `stopped_at` column as `deprecated_at` for tracking deprecation timestamps
  - Refactor heartbeat logic directly into lifecycle classes for improved type safety
  - Add configurable heartbeat interval (default: 5 seconds)
  - Workers complete in-flight work before shutting down when deprecated

- Updated dependencies [a67bf27]
  - @pgflow/dsl@0.6.0

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
