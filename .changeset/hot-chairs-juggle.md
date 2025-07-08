---
'@pgflow/core': patch
'@pgflow/dsl': patch
'@pgflow/website': patch
---

Add `startDelay` option for workflow steps

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
