# Plan: Fix Orphaned Messages on Run Failure

## Problem Statement

When a run fails, messages for pending tasks remain in the queue indefinitely, causing:
1. **Resource waste**: Workers continuously poll orphaned messages
2. **Performance degradation**: Queue operations slow down over time
3. **Map step issues**: Failing one map task leaves N-1 sibling messages orphaned
4. **Type violations**: Deterministic errors retry unnecessarily

## Current Behavior

### When fail_task is called
```sql
-- Only archives the single failing task's message
SELECT pgmq.archive('pgflow_tasks_queue', fail_task.msg_id);
-- Leaves all other queued messages orphaned
```

### When type constraint violation occurs
```sql
-- Raises exception, causes retries
RAISE EXCEPTION 'Map step % expects array input...';
-- Transaction rolls back, but retries will hit same error
```

## Implementation Plan

### 1. Update fail_task Function
**File**: `pkgs/core/schemas/0100_function_fail_task.sql`

Add after marking run as failed (around line 47):
```sql
-- Archive all pending messages for this run
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

### 2. Update complete_task for Type Violations
**File**: `pkgs/core/schemas/0100_function_complete_task.sql`

Replace the current RAISE EXCEPTION block (lines 115-120) with:
```sql
IF v_dependent_map_slug IS NOT NULL THEN
  -- Mark run as failed immediately (no retries for type violations)
  UPDATE pgflow.runs
  SET status = 'failed',
      failed_at = now(),
      error = format('Type contract violation: Map step %s expects array input but dependency %s produced %s (output: %s)',
                     v_dependent_map_slug,
                     complete_task.step_slug,
                     CASE WHEN complete_task.output IS NULL THEN 'null'
                          ELSE jsonb_typeof(complete_task.output) END,
                     complete_task.output)
  WHERE run_id = complete_task.run_id;

  -- Archive ALL pending messages for this run
  PERFORM pgmq.archive('pgflow_tasks_queue', t.msg_id)
  FROM pgflow.step_tasks t
  WHERE t.run_id = complete_task.run_id
    AND t.status = 'pending'
    AND t.msg_id IS NOT NULL;

  -- Mark the current task as failed (not completed)
  UPDATE pgflow.step_tasks
  SET status = 'failed',
      failed_at = now(),
      error_message = format('Type contract violation: produced %s instead of array',
                            CASE WHEN complete_task.output IS NULL THEN 'null'
                                 ELSE jsonb_typeof(complete_task.output) END)
  WHERE run_id = complete_task.run_id
    AND step_slug = complete_task.step_slug
    AND task_index = complete_task.task_index;

  -- Return empty result set (task not completed)
  RETURN QUERY SELECT * FROM pgflow.step_tasks WHERE false;
  RETURN;
END IF;
```

### 3. Add Supporting Index
**File**: New migration or add to existing

```sql
-- Speed up the archiving query
CREATE INDEX IF NOT EXISTS idx_step_tasks_pending_with_msg
ON pgflow.step_tasks(run_id, status)
WHERE status = 'pending' AND msg_id IS NOT NULL;
```

## Testing

### Tests Already Written (Stashed)

1. **`supabase/tests/fail_task/archive_sibling_map_tasks.test.sql`**
   - Verifies all map task messages are archived when one fails
   - Tests: 8 assertions about message archiving and status

2. **`supabase/tests/initial_tasks_null/archive_messages_on_type_constraint_failure.test.sql`**
   - Verifies type violations archive all pending messages
   - Tests: 8 assertions about queue cleanup and run status

### How to Run Tests
```bash
# After unstashing and implementing the fixes:
pnpm nx test:pgtap core -- supabase/tests/fail_task/archive_sibling_map_tasks.test.sql
pnpm nx test:pgtap core -- supabase/tests/initial_tasks_null/archive_messages_on_type_constraint_failure.test.sql
```

## Migration Considerations

### Backward Compatibility
- New behavior only affects failed runs (safe)
- Archiving preserves messages (can be recovered if needed)
- No schema changes to existing tables

### Performance Impact
- One-time cost during failure (acceptable)
- Prevents ongoing performance degradation (improvement)
- Index ensures archiving query is efficient

### Rollback Plan
If issues arise:
1. Remove the archiving logic
2. Messages remain in queue (old behavior)
3. No data loss since we archive, not delete

## Edge Cases to Consider

### 1. Concurrent Task Completion
If multiple tasks complete/fail simultaneously:
- PostgreSQL row locks ensure consistency
- Each failure archives all pending messages
- Idempotent: archiving already-archived messages is safe

### 2. Very Large Map Steps
For maps with 1000+ tasks:
- Archiving might take several seconds
- Consider batching if performance issues arise
- Current approach should handle up to ~10k tasks reasonably

### 3. Mixed Step Types
When run has both map and single steps:
- Archive logic handles all pending tasks regardless of type
- Correctly archives both map siblings and unrelated pending tasks

## Future Enhancements (Not for this PR)

1. **Selective Archiving**: Only archive tasks that can't proceed
2. **Batch Operations**: Archive in chunks for very large runs
3. **Recovery Mechanism**: Function to unarchive and retry
4. **Monitoring**: Track archived message counts for alerting

## Success Criteria

- [ ] All tests pass (both new test files)
- [ ] No orphaned messages after run failure
- [ ] Type violations don't retry
- [ ] Performance acceptable for maps with 100+ tasks
- [ ] No impact on successful run performance

## Implementation Checklist

- [ ] Update `fail_task` function
- [ ] Update `complete_task` function
- [ ] Add database index
- [ ] Unstash and run tests
- [ ] Test with large map steps (100+ tasks)
- [ ] Update migration file
- [ ] Document behavior change in function comments

## Notes

- This fix is **critical for production** - without it, queue performance will degrade over time
- Type violations are **deterministic** - retrying them is always wasteful
- Archiving (vs deleting) preserves debugging capability
- The fix is relatively simple (~30 lines of SQL) but high impact