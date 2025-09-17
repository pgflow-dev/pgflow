# Plan: Add `output` Column to `step_states` Table

## Context & Timing

**Status**: READY FOR FUTURE PR (not for current map aggregation PR)

This plan was developed during the map output aggregation PR but should be implemented as a follow-up optimization after the map infrastructure stack is complete. The current PR uses inline aggregation which is sufficient for MVP.

**Prerequisites**:
- Map infrastructure fully merged to main
- All map-related PRs complete (DSL, integration tests, migration consolidation)
- Current inline aggregation approach proven stable

## Executive Summary

This plan outlines the migration from inline output aggregation to storing step outputs directly in `pgflow.step_states`. This architectural change will improve performance, simplify code, and provide a cleaner data model.

## Current State Analysis

### Where Output Aggregation Happens Today

1. **`pgflow.start_tasks`** (schemas/0120_function_start_tasks.sql:52-62)
   - Aggregates map outputs when starting dependent steps
   - Each dependent step re-aggregates outputs from scratch

2. **`pgflow.maybe_complete_run`** (schemas/0100_function_maybe_complete_run.sql:36-45)
   - Aggregates outputs for leaf steps when building run output
   - Only runs at flow completion

3. **`pgflow.complete_task`** (schemas/0100_function_complete_task.sql:184-197)
   - Aggregates outputs for broadcast events
   - Runs on every map step completion

### Current Problems

- **Performance**: Same aggregation query runs multiple times
- **Complexity**: Aggregation logic duplicated in 3 places
- **Map-to-Map Inefficiency**: Aggregate array just to immediately decompose it
- **Testing Burden**: Need to test aggregation in multiple contexts

## Proposed Architecture

### Schema Change

```sql
ALTER TABLE pgflow.step_states
ADD COLUMN output jsonb;

-- Constraint: output only set when step is completed
ALTER TABLE pgflow.step_states
ADD CONSTRAINT output_only_when_completed CHECK (
  output IS NULL OR status = 'completed'
);
```

### Key Design Decisions

1. **Single steps**: Store task output directly (no aggregation needed)
2. **Map steps**: Store aggregated array ordered by task_index
3. **Taskless steps**: Store empty array `[]` for map steps, NULL for single steps
4. **Storage location**: Step output belongs at step level, not task level

## Implementation Changes

### 1. Schema Updates

**File**: New migration or update `0060_tables_runtime.sql`
- Add `output jsonb` column to `step_states`
- Add constraint `output_only_when_completed`

### 2. Function Updates

#### `pgflow.complete_task` - PRIMARY CHANGE
**File**: `schemas/0100_function_complete_task.sql`

**Current Lines 86-104**: Update step state completion
```sql
-- NEW: Set output when step completes
UPDATE pgflow.step_states
SET
  status = 'completed',
  completed_at = now(),
  remaining_tasks = 0,
  -- NEW: Store output at step level
  output = CASE
    WHEN (SELECT step_type FROM pgflow.steps
          WHERE flow_slug = step_state.flow_slug
            AND step_slug = complete_task.step_slug) = 'map' THEN
      -- Aggregate all task outputs for map steps
      (SELECT COALESCE(jsonb_agg(output ORDER BY task_index), '[]'::jsonb)
       FROM pgflow.step_tasks
       WHERE run_id = complete_task.run_id
         AND step_slug = complete_task.step_slug
         AND status = 'completed')
    ELSE
      -- Single step: use the task output directly
      complete_task.output
  END
WHERE ...
```

**Current Lines 184-197**: Simplify broadcast event
```sql
-- SIMPLIFIED: Read from step_states.output
'output', v_step_state.output,
```

#### `pgflow.start_tasks` - SIMPLIFY
**File**: `schemas/0120_function_start_tasks.sql`

**Current Lines 50-62**: Replace aggregation with simple read
```sql
-- SIMPLIFIED: Read from step_states.output
dep_state.output as dep_output
...
FROM pgflow.step_states dep_state
WHERE dep_state.run_id = st.run_id
  AND dep_state.step_slug = dep.dep_slug
  AND dep_state.status = 'completed'
```

#### `pgflow.maybe_complete_run` - SIMPLIFY
**File**: `schemas/0100_function_maybe_complete_run.sql`

**Current Lines 24-45**: Replace aggregation with simple read
```sql
-- SIMPLIFIED: Read from step_states.output
SELECT jsonb_object_agg(step_slug, output)
FROM pgflow.step_states ss
WHERE ss.run_id = maybe_complete_run.run_id
  AND NOT EXISTS (
    SELECT 1 FROM pgflow.deps d
    WHERE d.flow_slug = ss.flow_slug
      AND d.dep_slug = ss.step_slug
  )
```

#### `pgflow.cascade_complete_taskless_steps` - UPDATE
**File**: `schemas/0100_function_cascade_complete_taskless_steps.sql`

**Current Lines 27-32**: Set output for taskless steps
```sql
UPDATE pgflow.step_states ss
SET status = 'completed',
    started_at = now(),
    completed_at = now(),
    remaining_tasks = 0,
    -- NEW: Set output for taskless steps
    output = CASE
      WHEN s.step_type = 'map' THEN '[]'::jsonb  -- Empty array for map
      ELSE NULL  -- NULL for single steps
    END
```

#### `pgflow.get_run_with_states` - ALREADY COMPATIBLE
**File**: `schemas/0105_function_get_run_with_states.sql`
- No changes needed - will automatically include output in response

### 3. Test Updates

#### Tests to Update (Add Assertions for `step_states.output`)

1. **`tests/map_output_aggregation/basic_aggregation.test.sql`**
   - Add: Verify `step_states.output` contains `[{output1}, {output2}, {output3}]`

2. **`tests/map_output_aggregation/empty_map.test.sql`**
   - Add: Verify `step_states.output = '[]'::jsonb`

3. **`tests/map_output_aggregation/order_preservation.test.sql`**
   - Add: Verify output array order matches task_index order

4. **`tests/map_output_aggregation/map_to_single.test.sql`**
   - Modify: Check dependent gets input from `step_states.output`

5. **`tests/map_output_aggregation/map_to_map.test.sql`**
   - Modify: Verify second map receives array from first map's `step_states.output`

6. **`tests/map_output_aggregation/run_completion_leaf_map.test.sql`**
   - Modify: Verify run output uses `step_states.output`

7. **`tests/map_output_aggregation/null_outputs.test.sql`**
   - Add: Verify NULL values preserved in `step_states.output` array

8. **`tests/map_output_aggregation/mixed_dependencies.test.sql`**
   - Add: Verify both map and single steps populate output correctly

9. **`tests/map_output_aggregation/partial_completion_prevention.test.sql`**
   - Add: Verify output remains NULL until all tasks complete

10. **`tests/map_output_aggregation/failed_task_handling.test.sql`**
    - Add: Verify output remains NULL when step fails

11. **`tests/map_output_aggregation/map_initial_tasks_timing.test.sql`**
    - No changes needed (focuses on timing)

12. **`tests/map_output_aggregation/deep_map_chain.test.sql`**
    - Modify: Verify each map in chain reads from previous `step_states.output`

13. **`tests/map_output_aggregation/broadcast_aggregation.test.sql`**
    - Modify: Verify broadcast uses `step_states.output`

14. **`tests/map_output_aggregation/concurrent_completion.test.sql`**
    - Add: Verify final `step_states.output` correct despite concurrency

15. **`tests/map_output_aggregation/multiple_maps_to_single.test.sql`**
    - Modify: Verify single step gets inputs from multiple `step_states.output`

16. **`tests/complete_task/saves_output_when_completing_run.test.sql`**
    - Modify: Verify run output built from `step_states.output`

17. **`tests/completing_taskless_steps/*.sql` (7 files)**
    - Add: Verify taskless maps have `output = '[]'`
    - Add: Verify taskless single steps have `output = NULL`

#### New Tests to Create

1. **`tests/step_output/single_step_output.test.sql`**
   ```sql
   -- Verify single step stores task output directly in step_states.output
   -- Complete a single task, check step_states.output = task.output
   ```

2. **`tests/step_output/map_step_aggregation.test.sql`**
   ```sql
   -- Verify map step aggregates all task outputs in order
   -- Complete N tasks, check step_states.output = array of N outputs
   ```

3. **`tests/step_output/output_only_when_completed.test.sql`**
   ```sql
   -- Verify output is NULL for non-completed steps
   -- Check constraint prevents setting output on non-completed steps
   ```

4. **`tests/step_output/taskless_step_outputs.test.sql`**
   ```sql
   -- Verify taskless map steps get '[]' as output
   -- Verify taskless single steps get NULL as output
   ```

5. **`tests/step_output/null_task_outputs.test.sql`**
   ```sql
   -- Verify NULL task outputs are preserved in aggregation
   -- Map with [null, {data}, null] -> step_states.output has all three
   ```

#### Tests to Remove/Update

1. **`tests/map_output_aggregation/broadcast_output_verification.test.sql`**
   - **Action**: REMOVE - This test demonstrates a bug that becomes architecturally impossible
   - **Reason**: With `step_states.output`, there's no confusion between task and aggregated output

2. **`tests/map_output_aggregation/broadcast_event_bug.test.sql`**
   - **Action**: KEEP AS-IS - Becomes regression test
   - **Reason**: Will pass without modification, ensures broadcasts use aggregated output
   - **Note**: No longer needs complex realtime.send mocking - just query realtime.messages

### 4. Performance Tests

**File**: `tests/performance/map_aggregation_performance.test.sql`

Measure performance improvement:
1. Create flow with map -> map -> map chain
2. Complete tasks and measure query times
3. Compare with baseline from current implementation

Expected improvements:
- `start_tasks`: 30-50% faster (no aggregation needed)
- `complete_task` broadcast: 20-30% faster
- Map-to-map chains: 50-70% faster (no aggregate/decompose cycle)

## Migration Strategy

### Option 1: Single Migration (Recommended)
1. Add column with DEFAULT NULL
2. Update all functions in same migration
3. Backfill existing data if needed

### Option 2: Phased Migration
1. Add column (NULL allowed)
2. Update `complete_task` to write to both locations
3. Update consumers to read from new location
4. Remove old aggregation logic

## Rollback Plan

If issues arise:
1. Functions can temporarily aggregate on-the-fly if output column is NULL
2. Add fallback logic: `COALESCE(step_states.output, <aggregation_query>)`
3. Remove column only after confirming no dependencies

## Benefits Summary

1. **Performance**: Eliminate redundant aggregation queries
2. **Simplicity**: Single source of truth for step outputs
3. **Consistency**: Uniform output handling for all step types
4. **Maintainability**: Aggregation logic in one place
5. **Future-proof**: Enables features like result caching, partial re-runs

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Storage overhead | Minimal - same data, different location |
| Migration complexity | Test thoroughly, use transaction |
| Backward compatibility | Add column as nullable initially |
| Performance regression | Benchmark before/after |

## Implementation Order

1. Create performance baseline tests
2. Add schema migration
3. Update `complete_task` (primary change)
4. Update `cascade_complete_taskless_steps`
5. Simplify `start_tasks`
6. Simplify `maybe_complete_run`
7. Simplify broadcast in `complete_task`
8. Update/create tests
9. Run performance comparison
10. Document changes

## Implementation Tasks

### Phase 1: Schema & Core Function Updates
- [ ] Create migration adding `output` column to `step_states`
- [ ] Update `pgflow.complete_task` to populate `output` on step completion
- [ ] Update `pgflow.cascade_complete_taskless_steps` to set output for taskless steps

### Phase 2: Consumer Function Updates
- [ ] Simplify `pgflow.start_tasks` to read from `step_states.output`
- [ ] Simplify `pgflow.maybe_complete_run` to read from `step_states.output`
- [ ] Simplify broadcast in `pgflow.complete_task` to use `v_step_state.output`

### Phase 3: Test Updates
- [ ] Update map output aggregation test assertions (18 tests)
- [ ] Remove `broadcast_output_verification.test.sql`
- [ ] Verify `broadcast_event_bug.test.sql` passes without modification
- [ ] Create 5 new tests for output column behavior
- [ ] Run and verify all tests pass

### Phase 4: Performance Validation
- [ ] Create baseline performance measurements
- [ ] Run performance tests after implementation
- [ ] Document performance improvements

### Phase 5: Cleanup
- [ ] Remove temporary migration `20250917161744_pgflow_temp_handle_map_output_aggregation.sql`
- [ ] Consolidate into single clean migration
- [ ] Update documentation

## Success Criteria

- [ ] All existing tests pass with modifications
- [ ] New tests verify output column behavior
- [ ] Performance tests show improvement or no regression
- [ ] Code complexity reduced (3 aggregation sites -> 1)
- [ ] Migration runs cleanly on existing data
- [ ] Broadcast bug architecturally prevented