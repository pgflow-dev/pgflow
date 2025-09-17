# Map Output Aggregation Invariants & Test Scenarios

## Core Invariants

These properties must ALWAYS hold true for the map output aggregation feature to be correct:

### 1. Order Preservation ✅
- **Invariant**: Aggregated outputs MUST maintain task_index order
- **Test**: `output[i]` must correspond to `task_index = i`
- **Rationale**: Array index semantics must be preserved through aggregation
- **Coverage**: Well tested in 8+ files (basic_aggregation, order_preservation, map_to_map, run_completion_leaf_map, etc.)

### 2. Completeness ✅
- **Invariant**: Aggregation occurs IFF all tasks are completed
- **Test**: No partial aggregation when any task is pending/failed
- **Rationale**: Map step output represents the complete transformation
- **Coverage**: Well tested in 6+ files (partial_completion_prevention, failed_task_handling, etc.)

### 3. Empty Array Handling ✅
- **Invariant**: Map steps with 0 tasks produce `[]` not `NULL`
- **Test**: Empty maps must output `[]` for downstream compatibility
- **Rationale**: Consistent array type for dependent steps
- **Coverage**: Well tested (empty_map.test.sql, completing_taskless_steps tests)

### 4. NULL Preservation ✅
- **Invariant**: NULL task outputs are preserved in aggregated array
- **Test**: `[null, {data}, null]` remains exactly as is
- **Rationale**: NULL is semantically different from missing
- **Coverage**: Tested in null_outputs.test.sql, initial_tasks_null tests

### 5. Aggregation Points Consistency ⚠️
- **Invariant**: All aggregation points produce identical results
- **Test**: `start_tasks`, `maybe_complete_run`, and broadcasts must match
- **Rationale**: Single source of truth principle
- **Coverage**: Partially tested - KNOWN BUG: broadcasts send individual task output instead of aggregated array

### 6. Type Safety for Map Dependencies ✅
- **Invariant**: Map steps ONLY accept array inputs (or NULL for initial_tasks)
- **Test**: Non-array output to map step must fail the run
- **Rationale**: Type safety prevents runtime errors
- **Coverage**: Well tested with both positive and negative cases (non_array_to_map_should_fail, null_output_to_map_should_fail)

### 7. Single Aggregation Per Step Completion ✅
- **Invariant**: Aggregation happens exactly once when step completes
- **Test**: No re-aggregation on subsequent operations
- **Rationale**: Performance and consistency
- **Coverage**: Tested in run_completion_leaf_map, failed_task_handling

## Critical Test Scenarios

### Basic Aggregation
1. **3-task map completion** ✅
   - Complete tasks 0, 1, 2 with distinct outputs
   - Verify aggregated array = `[output0, output1, output2]`
   - **Coverage**: basic_aggregation.test.sql

2. **Empty map (0 tasks)** ✅
   - Map step with initial_tasks = 0
   - Verify output = `[]`
   - **Coverage**: empty_map.test.sql

3. **Single task map** ❌
   - Map with 1 task
   - Verify output = `[task_output]` (array with one element)
   - **Coverage**: NOT TESTED

### Order Preservation
4. **Out-of-order task completion** ✅
   - Complete tasks 2, 0, 1 (not in index order)
   - Verify final array still ordered by task_index
   - **Coverage**: order_preservation.test.sql

5. **Concurrent task completion** ✅
   - Multiple workers completing tasks simultaneously
   - Verify order preserved despite race conditions
   - **Coverage**: concurrent_completion.test.sql

### Map-to-Map Chains
6. **Map feeding into map** ✅
   - First map outputs `[1, 2, 3]`
   - Second map spawns 3 tasks
   - Each task receives individual element
   - **Coverage**: map_to_map.test.sql

7. **Deep map chain (3+ levels)** ✅
   - Map → Map → Map
   - Verify aggregation at each level
   - **Coverage**: deep_map_chain.test.sql

8. **Empty array propagation** ✅
   - Map with 0 tasks → dependent map
   - Dependent map should also have 0 tasks
   - **Coverage**: normal_to_map_empty.test.sql, cascade tests

### Map-to-Single Patterns
9. **Map feeding single step** ✅
   - Map outputs `[{a}, {b}, {c}]`
   - Single step receives full array as input
   - **Coverage**: map_to_single.test.sql

10. **Multiple maps to single** ✅
    - Two map steps → single step
    - Single step gets both arrays as dependencies
    - **Coverage**: multiple_maps_to_single.test.sql

### Error Cases
11. **NULL output to map** ✅
    - Single step returns NULL
    - Dependent map should fail with clear error
    - **Coverage**: null_output_to_map_should_fail.test.sql

12. **Non-array output to map** ✅
    - Single step returns `{object}` or `"string"`
    - Dependent map should fail with type error
    - **Coverage**: non_array_to_map_should_fail.test.sql

13. **Failed task in map** ✅
    - One task fails in 3-task map
    - Map step should be marked failed
    - No aggregation should occur
    - **Coverage**: failed_task_handling.test.sql

14. **Partial completion prevention** ✅
    - 2 of 3 tasks complete
    - Aggregation must NOT occur
    - Output remains undefined/NULL
    - **Coverage**: partial_completion_prevention.test.sql

### Edge Cases
15. **NULL values in output array** ✅
    - Tasks return `[{data}, null, {more}]`
    - Aggregated array preserves NULLs exactly
    - **Coverage**: null_outputs.test.sql

16. **Large arrays (100+ tasks)** ✅
    - Performance must remain linear
    - Order preservation at scale
    - **Coverage**: large_array_performance.test.sql, map_large_array.test.sql

17. **Mixed step types** ✅
    - Single → Map → Single → Map
    - Each transition handles types correctly
    - **Coverage**: mixed_dependencies.test.sql

### Broadcast Events
18. **Step completion broadcast** ⚠️
    - Map step completes
    - Broadcast contains aggregated array, not last task output
    - **Coverage**: KNOWN BUG - broadcast_aggregation.test.sql, broadcast_output_verification.test.sql

19. **Run completion with leaf map** ✅
    - Map step as terminal node
    - Run output contains aggregated array
    - **Coverage**: run_completion_leaf_map.test.sql

### Timing & State
20. **Initial_tasks resolution timing** ✅
    - Dependent map's initial_tasks set when dependency completes
    - Not before, not after
    - **Coverage**: map_initial_tasks_timing.test.sql

21. **Taskless cascade with maps** ✅
    - Map with 0 tasks triggers cascade
    - Dependent steps complete in topological order
    - **Coverage**: taskless_sequence.test.sql, cascade_performance.test.sql

## Performance Invariants

### Aggregation Efficiency
- **Invariant**: Aggregation query runs O(n) where n = number of tasks
- **Test**: Measure query time scales linearly with task count

### No Redundant Aggregation
- **Invariant**: Same data never aggregated twice for same purpose
- **Test**: Trace queries, ensure no duplicate aggregations

## Implementation Requirements

To satisfy these invariants, the implementation MUST:

1. Use `ORDER BY task_index` in all aggregation queries
2. Use `COALESCE(..., '[]'::jsonb)` for empty array default
3. Check task completion status before aggregating
4. Validate input types for map steps
5. Aggregate exactly once at step completion
6. Store or compute aggregated output consistently

## Verification Checklist

- [x] All basic aggregation tests pass
- [x] Order preserved across all scenarios
- [x] Empty arrays handled correctly
- [x] NULL values preserved
- [x] Type errors caught and reported
- [ ] Broadcasts contain aggregated output (KNOWN BUG - sends individual task output)
- [x] Performance scales linearly
- [x] No redundant aggregations (single aggregation per completion)
- [x] Map-to-map chains work correctly
- [x] Error cases fail gracefully

## Test Coverage Summary

### Well Covered Invariants (✅)
- Order Preservation (8+ test files)
- Completeness (6+ test files)
- Empty Array Handling (multiple test files)
- NULL Preservation (explicit tests)
- Type Safety for Map Dependencies (positive & negative cases)
- Single Aggregation Per Step Completion

### Known Issues (⚠️)
- **Aggregation Points Consistency**: Broadcast events contain individual task outputs instead of aggregated arrays (documented bug in broadcast_aggregation.test.sql and broadcast_output_verification.test.sql)

### Missing Test Coverage (❌)
- **Single task map**: No test for map with exactly 1 task producing `[output]`

### Recommendations
1. Fix the broadcast aggregation bug (currently sends last task output instead of aggregated array)
2. Add test for single-task map scenario
3. Consider removing broadcast_output_verification.test.sql once bug is fixed (it demonstrates the bug)