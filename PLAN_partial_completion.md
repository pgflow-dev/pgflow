# Partial Completion & Recovery Strategy for pgflow

## Problem Statement

When workflows fail mid-execution, especially after irreversible operations (API calls, database writes, external system mutations), we need a way to:
1. Preserve completed work
2. Allow recovery/continuation from failure point
3. Clean up orphaned resources (queued messages)
4. Provide clear failure semantics

Currently, pgflow fails entire runs on any task failure, which:
- Wastes successfully completed work
- Leaves orphaned messages in queues
- Provides no recovery path
- Forces users to restart from scratch

## How Other Systems Handle This

### Temporal
**Approach**: Continue-As-New & Compensation
- **State Preservation**: Workflow state survives failures, can be resumed
- **Saga Pattern**: Explicit compensation activities to undo work
- **Activity Replay**: Deterministic replay skips completed activities
- **Non-Retryable Errors**: `ApplicationFailure` with `non_retryable=true`
- **Key Insight**: Distinguish between deterministic workflow errors (never retry) and transient activity errors (retry)

### Inngest
**Approach**: Step-Level Isolation with Try-Catch
- **Step Independence**: Each step can fail/retry independently
- **Failure Handling**: `try/catch` blocks around steps
- **NonRetriableError**: Permanent failures that stop execution
- **Failure Handlers**: `onFailure` callbacks for cleanup/rollback
- **Key Insight**: Partial success is normal - handle errors with standard language primitives

### Trigger.dev
**Approach**: Flexible Error Callbacks
- **handleError Callbacks**: Decide retry behavior per error type
- **Conditional Retries**: Skip retries based on error details
- **Response-Based Timing**: Retry after time from response headers
- **Key Insight**: Error handling logic lives with workflow definition

### Apache Airflow
**Approach**: Clear & Resume
- **Task Clearing**: "Clear" failed tasks to retry from that point
- **Selective Retry**: Only retry failed tasks, not successful ones
- **Manual Intervention**: Operators can intervene to fix and resume
- **Backfill Operations**: Re-run specific date ranges or task sets
- **Key Insight**: Manual intervention is acceptable for complex failures

### AWS Step Functions
**Approach**: Hybrid Retry + Redrive
- **Automatic Retries**: For transient errors
- **Manual Redrive**: Resume from specific states after fixing root cause
- **Selective Resume**: Choose which nodes to resume from
- **Key Insight**: Combine automatic and manual recovery strategies

## Current pgflow Behavior

### Type Contract Violations
```sql
-- In complete_task: RAISES EXCEPTION, causes retry attempts
IF v_dependent_map_slug IS NOT NULL THEN
  RAISE EXCEPTION 'Map step % expects array input...';
END IF;
```
**Problems**:
- Retries a deterministic error (won't fix itself)
- Wastes resources on pointless retries
- No cleanup of sibling/parallel tasks

### Task Failures (fail_task)
```sql
-- Archives only the failing task's message
SELECT pgmq.archive('pgflow_tasks_queue', fail_task.msg_id);
-- Leaves all other queued messages orphaned!
```
**Problems**:
- Orphaned messages waste worker resources
- Queue performance degrades over time
- No cleanup of sibling map tasks

## Proposed Solution (MVP)

### Phase 1: Immediate Message Cleanup (Current PR)

#### 1. Enhanced fail_task - Archive All Pending Messages
```sql
-- After marking run as failed, archive ALL pending messages
WITH tasks_to_archive AS (
  SELECT t.msg_id
  FROM pgflow.step_tasks t
  WHERE t.run_id = fail_task.run_id
    AND t.status = 'pending'
    AND t.msg_id IS NOT NULL
)
SELECT pgmq.archive('pgflow_tasks_queue', msg_id)
FROM tasks_to_archive;
```

#### 2. Type Contract Violation - Fail Fast Without Retries
```sql
-- In complete_task validation block
IF v_dependent_map_slug IS NOT NULL THEN
  -- Mark run as failed immediately (no retries)
  UPDATE pgflow.runs
  SET status = 'failed',
      failed_at = now(),
      error = format('Type contract violation: ...')
  WHERE run_id = complete_task.run_id;

  -- Archive ALL pending messages immediately
  PERFORM pgmq.archive('pgflow_tasks_queue', t.msg_id)
  FROM pgflow.step_tasks t
  WHERE t.run_id = complete_task.run_id
    AND t.status = 'pending'
    AND t.msg_id IS NOT NULL;

  -- Still raise for logging
  RAISE EXCEPTION 'Type contract violation - run % failed', run_id;
END IF;
```

### Phase 2: Partial Success Status (Post-MVP)

#### New Run Status
```sql
ALTER TYPE pgflow.run_status ADD VALUE 'partially_completed';
```

#### Track Permanent vs Transient Failures
```sql
ALTER TYPE pgflow.task_status ADD VALUE 'failed_permanent';

-- In complete_task for type violations
UPDATE pgflow.step_tasks
SET status = 'failed_permanent',
    error = 'Type contract violation...'
WHERE ...;
```

#### Update Run Completion Logic
```sql
-- In maybe_complete_run
UPDATE pgflow.runs
SET status = CASE
  WHEN EXISTS (SELECT 1 FROM pgflow.step_tasks
               WHERE run_id = ...
               AND status IN ('failed', 'failed_permanent'))
  THEN 'partially_completed'
  ELSE 'completed'
END
```

### Phase 3: Clear & Resume Capability (Future)

#### Clear Failed Tasks
```sql
CREATE FUNCTION pgflow.clear_task(
  run_id uuid,
  step_slug text,
  task_index integer DEFAULT NULL  -- NULL = clear all tasks for step
) RETURNS void AS $$
BEGIN
  -- Reset task(s) to pending
  UPDATE pgflow.step_tasks
  SET status = 'pending',
      attempts_count = 0,
      error_message = NULL,
      started_at = NULL,
      failed_at = NULL
  WHERE pgflow.step_tasks.run_id = clear_task.run_id
    AND pgflow.step_tasks.step_slug = clear_task.step_slug
    AND (clear_task.task_index IS NULL OR pgflow.step_tasks.task_index = clear_task.task_index);

  -- Re-enqueue to pgmq
  -- ... re-queue logic ...
END;
$$;
```

#### Resume Failed Run
```sql
CREATE FUNCTION pgflow.resume_run(
  run_id uuid,
  from_step text DEFAULT NULL  -- Resume from specific step or all failed
) RETURNS void AS $$
BEGIN
  -- Reset run status
  UPDATE pgflow.runs
  SET status = 'started',
      failed_at = NULL
  WHERE pgflow.runs.run_id = resume_run.run_id;

  -- Clear failed steps
  -- ... clear logic ...

  -- Restart flow processing
  PERFORM pgflow.start_ready_steps(resume_run.run_id);
END;
$$;
```

## Implementation Priority

### Must Have (Current PR)
1. ✅ Archive all messages when run fails
2. ✅ Handle map sibling tasks specially
3. ✅ Type violations fail immediately without retries

### Should Have (Next PR)
1. Partial completion status
2. Distinguish permanent vs transient failures
3. Better error messages with recovery hints

### Nice to Have (Future)
1. Clear/resume individual tasks
2. Compensation/rollback hooks
3. Checkpoint/savepoint system
4. Workflow versioning for hot-patches

## Trade-offs & Decisions

### Why Archive vs Delete Messages?
- **Archive**: Preserves audit trail, can analyze failures
- **Delete**: Saves space but loses debugging info
- **Decision**: Archive for now, add cleanup job later

### Why Fail Entire Run vs Continue Parallel Branches?
- **Fail Run**: Simple, predictable, matches user expectations
- **Continue**: Complex state management, confusing semantics
- **Decision**: Fail run for MVP, consider partial continuation later

### Why No Automatic Compensation?
- **Compensation**: Requires user-defined rollback logic
- **No Compensation**: Simpler, lets users handle externally
- **Decision**: No built-in compensation for MVP, document patterns

## Testing Requirements

### Failing Tests (Already Created)
1. `archive_sibling_map_tasks.test.sql` - Verify fail_task archives all map task messages
2. `archive_messages_on_type_constraint_failure.test.sql` - Verify type violations archive all pending messages

### Additional Tests Needed
1. Performance impact of archiving many messages
2. Race conditions during failure/archive
3. Recovery after clear/resume
4. Partial completion status transitions

## Migration Path

### For Existing Users
1. Failure behavior changes are backward compatible
2. New statuses are additive (won't break existing code)
3. Clear/resume are opt-in features

### Database Changes
```sql
-- Add to migration
CREATE INDEX ON pgflow.step_tasks(run_id, status)
WHERE msg_id IS NOT NULL;  -- Speed up message archiving

-- Future: Add partial_completed status
-- Future: Add failed_permanent task status
```

## Documentation Requirements

### User-Facing Docs
1. Explain failure modes and recovery options
2. Document clear/resume functions
3. Best practices for idempotent handlers
4. Patterns for compensation/rollback

### Developer Notes
1. Why we archive vs delete messages
2. Performance implications of batch archiving
3. How to extend for custom failure handling

## Success Metrics

### Immediate (Current PR)
- [ ] No orphaned messages after failures
- [ ] Type violations don't waste retries
- [ ] Tests pass for message archiving

### Long-term
- [ ] Users can recover from partial failures
- [ ] Queue performance doesn't degrade over time
- [ ] Clear error messages guide recovery
- [ ] Support for compensation patterns

## References

- Temporal Saga Pattern: https://docs.temporal.io/application-development/application-design-patterns#saga
- Inngest Error Handling: https://www.inngest.com/docs/guides/error-handling
- Airflow Task Clearing: https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html
- AWS Step Functions Redrive: https://aws.amazon.com/blogs/compute/introducing-aws-step-functions-redrive-a-new-way-to-restart-workflows/

## Open Questions

1. **Should we add a `retry_on_clear` flag to steps?** Some steps might not be safe to retry even manually.

2. **How to handle time-sensitive operations?** If a step sends a "order shipped" email, clearing and retrying days later might be inappropriate.

3. **Should partial_completed runs be reusable?** Or should resume create a new run linked to the original?

4. **Message archiving performance?** At what scale does archiving 1000s of messages become problematic?

5. **Compensation pattern?** Should pgflow provide first-class support for compensation/rollback handlers?

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2024-01-18 | Archive messages, don't delete | Preserves debugging info, can add cleanup later |
| 2024-01-18 | Type violations fail immediately | Deterministic errors shouldn't retry |
| 2024-01-18 | No built-in compensation for MVP | Keep it simple, document patterns |
| 2024-01-18 | Fail entire run on task failure | Predictable behavior, simpler state management |