# @pgflow/dsl

## 0.5.4

### Patch Changes

- 9f219a4: Add context object as second parameter to handlers

  Queue and flow handlers now receive an optional context parameter that provides platform resources like database connections, environment variables, and Supabase clients - eliminating boilerplate and connection management.

  ```typescript
  // Queue handler
  EdgeWorker.start(async (payload, context) => {
    await context.sql`INSERT INTO tasks (data) VALUES (${payload})`;
  });

  // Flow step handler
  .step({ slug: 'process' }, async (input, context) => {
    const result = await context.supabase.from('users').select();
  })
  ```

  **Core resources** (always available):

  - `context.env` - Environment variables
  - `context.shutdownSignal` - AbortSignal for graceful shutdown
  - `context.rawMessage` - Original pgmq message with metadata
  - `context.stepTask` - Current step task details (flow handlers only)

  **Supabase platform resources**:

  - `context.sql` - PostgreSQL client (postgres.js)
  - `context.supabase` - Supabase client with service role key

  To use Supabase resources in flows, import from the Supabase preset:

  ```typescript
  import { Flow } from '@pgflow/dsl/supabase';
  ```

  The context parameter is optional for backward compatibility - existing single-parameter handlers continue to work unchanged.

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

## 0.5.2

## 0.5.1

## 0.5.0

## 0.4.3

## 0.4.2

## 0.4.1

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

## 0.3.1

## 0.3.0

## 0.2.6

## 0.2.5

## 0.2.4

## 0.2.3

## 0.2.2

## 0.2.1

### Patch Changes

- 3f3174e: Update the README's

## 0.2.0

## 0.1.23

## 0.1.22

### Patch Changes

- 8f6eb3d: Added ExtractFlowLeafSteps and ExtractFlowOutput utility types

## 0.1.21

## 0.1.20

## 0.1.19

## 0.1.18

### Patch Changes

- 3a7e132: Do not build edge-worker for npm

## 0.1.17

### Patch Changes

- d215ed2: Trigger version change

## 0.1.16

### Patch Changes

- cc7c431: Test release to verify combined publishing of both npm and jsr packages

## 0.1.15

### Patch Changes

- ce34a2c: Update release pipeline to publish to jsr

## 0.1.14

## 0.1.13

## 0.1.12

### Patch Changes

- 7b1328e: Include invalid slug in validateSlug error message

## 0.1.11

## 0.1.10

### Patch Changes

- bafe767: Fix deno/ folder for cli being missing

## 0.1.9

### Patch Changes

- 1a30c6c: Make sure to tag and push tags

## 0.1.8

### Patch Changes

- 05f5bd8: Update release script

## 0.1.7

## 0.1.6

### Patch Changes

- Test release to verify problem with bumping edge-worker

## 0.1.5

### Patch Changes

- 5820e7a: Bump version for tests

## 0.1.4

## 0.1.3

## 0.1.2

## 0.1.1

### Patch Changes

- b362364: Add compileFlow function

## 0.1.0

## 0.0.23

## 0.0.22

## 0.0.21

## 0.0.20

## 0.0.19

## 0.0.18

### Patch Changes

- 53abf4a: Fix pnpm issues with linking to dist/

## 0.0.17

## 0.0.16

## 0.0.15

## 0.0.14

## 0.0.13

## 0.0.12

## 0.0.11

### Patch Changes

- 17937e3: Update changesets action and comment out custom publish

## 0.0.10

## 0.0.9

### Patch Changes

- 70d3f2d: Tweak extension setting in tsconfig.base.json

## 0.0.8

## 0.0.7

### Patch Changes

- 7c83db9: Add release-related options to package.json files

## 0.0.6

## 0.0.5

### Patch Changes

- b4b0809: test changesets
