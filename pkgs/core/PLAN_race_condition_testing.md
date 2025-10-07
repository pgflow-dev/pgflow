# PLAN: Race Condition Testing for Type Violations

## Background

When a type violation occurs (e.g., single step produces non-array for dependent map), the system must archive ALL active messages to prevent orphaned messages that cycle through workers indefinitely.

## Current Issue

The fix archives both `'queued'` AND `'started'` tasks, but existing tests don't properly validate the race condition scenarios.

## Test Scenarios Needed

### 1. Basic Type Violation (✅ Already Covered)
**Scenario**: Single task causes type violation
```
step1 (single) → step2 (single) → map_step
```
- Worker completes step2 with non-array
- Verify run fails and current task's message is archived
- **Coverage**: `non_array_to_map_should_fail.test.sql`

### 2. Concurrent Started Tasks (❌ Not Covered)
**Scenario**: Multiple workers have tasks in 'started' state when violation occurs
```
producer (single) → map_consumer (map, expects array)
producer (single) → parallel_task1 (single)
producer (single) → parallel_task2 (single)
```

**Test Flow**:
1. Complete producer with `[1, 2, 3]` (spawns 3 map tasks + 2 parallel tasks)
2. Worker A starts `map_consumer[0]`
3. Worker B starts `map_consumer[1]`
4. Worker C starts `parallel_task1`
5. Worker D starts `parallel_task2`
6. Worker C completes `parallel_task1` with non-array (violates some other map dependency)
7. **Verify**: ALL started tasks (map_consumer[0], map_consumer[1], parallel_task2) get archived

### 3. Mixed Queue States (❌ Not Covered)
**Scenario**: Mix of queued and started tasks across different steps
```
step1 → step2 → step3 → map_step
     ↘ step4 → step5
```

**Test Flow**:
1. Complete step1
2. Worker A starts step2
3. Worker B starts step4
4. Step3 and step5 remain queued
5. Worker A completes step2 with type violation
6. **Verify**: Both started (step4) AND queued (step3, step5) messages archived

### 4. Map Task Partial Processing (❌ Not Covered)
**Scenario**: Some map tasks started, others queued when violation occurs
```
producer → large_map (100 elements)
```

**Test Flow**:
1. Producer outputs array of 100 elements
2. Workers start processing first 10 tasks
3. 90 tasks remain queued
4. One of the started tasks detects downstream type violation
5. **Verify**: All 100 messages (10 started + 90 queued) get archived

### 5. Visibility Timeout Verification (❌ Not Covered)
**Scenario**: Ensure orphaned messages don't reappear after timeout
```
step1 → step2 → map_step
```

**Test Flow**:
1. Worker starts step2 (30s visibility timeout)
2. Type violation occurs but message NOT archived (simulate bug)
3. Wait 31 seconds
4. **Verify**: Message reappears in queue (demonstrates the bug)
5. Apply fix and verify message doesn't reappear

### 6. Nested Map Chains (❌ Not Covered)
**Scenario**: Type violation in middle of map chain
```
map1 (produces arrays) → map2 (expects arrays) → map3
```

**Test Flow**:
1. map1 task completes with non-array (violates map2 expectation)
2. Other map1 tasks are in various states (started/queued)
3. **Verify**: All map1 tasks archived, map2 never starts

### 7. Race During Archival (❌ Not Covered)
**Scenario**: Worker tries to complete task while archival is happening
```
step1 → step2 → map_step
```

**Test Flow**:
1. Worker A detects type violation, begins archiving
2. Worker B tries to complete its task during archival
3. **Verify**: Worker B's completion is rejected (guard clause)
4. **Verify**: No duplicate archival attempts

## Implementation Strategy

### Test Utilities Needed

1. **Multi-worker simulator**:
```sql
CREATE FUNCTION pgflow_tests.simulate_worker(
  worker_id uuid,
  flow_slug text
) RETURNS TABLE(...);
```

2. **Queue state inspector**:
```sql
CREATE FUNCTION pgflow_tests.inspect_queue_state(
  flow_slug text
) RETURNS TABLE(
  message_id bigint,
  task_status text,
  visibility_timeout timestamptz
);
```

3. **Time manipulation** (for visibility timeout tests):
```sql
-- May need to mock pgmq visibility behavior
```

### Test File Organization

```
supabase/tests/type_violations/
├── basic_violation.test.sql                 # Existing coverage
├── concurrent_started_tasks.test.sql        # NEW: Scenario 2
├── mixed_queue_states.test.sql              # NEW: Scenario 3
├── map_partial_processing.test.sql          # NEW: Scenario 4
├── visibility_timeout_recovery.test.sql     # NEW: Scenario 5
├── nested_map_chains.test.sql               # NEW: Scenario 6
└── race_during_archival.test.sql            # NEW: Scenario 7
```

## Success Criteria

1. **No orphaned messages**: Queue must be empty after type violation
2. **No message resurrection**: Archived messages don't reappear after timeout
3. **Complete cleanup**: ALL tasks (queued + started) for the run are handled
4. **Atomic operation**: Archival happens in single transaction
5. **Guard effectiveness**: No operations on failed runs

## Performance Considerations

- Test with large numbers of tasks (1000+) to verify batch archival performance
- Ensure archival doesn't lock tables for extended periods
- Verify index usage on `(run_id, status, message_id)`

## Current Gap Analysis

**What we have**:
- Basic type violation detection ✅
- Single task archival ✅
- Run failure on violation ✅

**What we need**:
- True concurrent worker simulation ❌
- Multi-task race condition validation ❌
- Visibility timeout verification ❌
- Performance under load testing ❌

## Priority

1. **HIGH**: Concurrent started tasks (Scenario 2) - Most common real-world case
2. **HIGH**: Map partial processing (Scenario 4) - Critical for large arrays
3. **MEDIUM**: Mixed queue states (Scenario 3) - Complex flows
4. **LOW**: Other scenarios - Edge cases but important for robustness