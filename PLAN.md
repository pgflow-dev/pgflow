# Map Infrastructure (SQL Core)

**NOTE: This PLAN.md file should be removed in the final PR once all map infrastructure is complete.**

### Current State

- ✅ **WORKING**: Empty array maps (taskless) cascade and complete correctly
- ✅ **WORKING**: Task spawning creates N tasks with correct indices
- ✅ **WORKING**: Dependency count propagation for map steps
- ❌ **MISSING**: Array element extraction - tasks get full array instead of individual items
- ❌ **MISSING**: Output aggregation - no way to combine map task outputs for dependents

### What Needs to Be Done

1. **Array Element Extraction in `start_tasks()`**

   - Each map task must receive `array[task_index]` not the entire array
   - Requires modifying the input assembly logic to use `jsonb_array_element()`

2. **Output Aggregation When Map Completes**
   - When all map tasks finish, aggregate outputs: `jsonb_agg(output ORDER BY task_index)`
   - Store this somewhere accessible to dependent steps
   - Options: Add column to step_states, compute on-demand, or temporary storage

### Example: What Should Happen (But Doesn't)

```sql
-- Given a flow: normalStep -> mapStep -> finalStep

-- 1. normalStep completes with output:
'["apple", "banana", "cherry"]'

-- 2. mapStep should spawn 3 tasks:
-- Task 0 receives: {"normalStep": "apple"} ← NOT WORKING (gets full array)
-- Task 1 receives: {"normalStep": "banana"} ← NOT WORKING (gets full array)
-- Task 2 receives: {"normalStep": "cherry"} ← NOT WORKING (gets full array)

-- 3. Each task processes and outputs:
-- Task 0 outputs: {"processed": "APPLE"}
-- Task 1 outputs: {"processed": "BANANA"}
-- Task 2 outputs: {"processed": "CHERRY"}

-- 4. When mapStep completes, aggregate outputs:
'[{"processed": "APPLE"}, {"processed": "BANANA"}, {"processed": "CHERRY"}]' ← NOT WORKING

-- 5. finalStep receives the aggregated array as input
```

## Implementation Status

### Sequential Child PR Plan

#### ✅ Completed PRs

- [x] **PR #207: Add .array() to DSL** - `feature-map-and-array`

  - TypeScript DSL enhancement for array creation
  - Foundation for map step functionality

- [x] **PR #208: Foundation - Schema & add_step()** - `09-10-feat_add_map_step_type_in_sql`

  - Schema changes (initial_tasks, remaining_tasks, constraints)
  - add_step() function with map step validation
  - Basic tests for map step creation

- [x] **PR #209: Root Map Support** - `09-11-root-map-support`

  - Enhanced start_flow() for root map validation and count setting
  - Tests for root map scenarios

- [x] **PR #210: Task Spawning** - `09-12-task-spawning`

  - Enhanced start_ready_steps() for N task generation
  - Empty array auto-completion
  - Tests for batch task creation

- [x] **PR #211: Cascade Complete Taskless Steps** - `09-15-complete-cascade`

  - Extracted taskless completion from start_ready_steps()
  - Added cascade_complete_taskless_steps() function with iteration safety
  - Generic solution for all initial_tasks=0 steps
  - Fixed flow_slug matching bug in dep_updates CTE
  - All taskless cascade tests passing (7/7 test files)

- [x] **PR #212: Dependent Map Count Propagation**
  - Enhanced complete_task() sets initial_tasks for dependent maps
  - Array validation and count propagation working
  - Cascade handles taskless dependent maps

#### ❌ Remaining Work

- [ ] **Array Element Distribution** (CRITICAL - BLOCKS REAL MAP USAGE)

  - Enhanced start_tasks() to distribute array elements to map tasks
  - Each map task receives its specific array element based on task_index
  - Handles both root maps (from run input) and dependent maps (from step outputs)
  - Tests with actual array data processing

- [ ] **Output Aggregation** (CRITICAL - BLOCKS MAP OUTPUT CONSUMPTION)

  - Aggregate map task outputs when step completes
  - Store aggregated output for dependent steps to consume
  - Maintain task_index ordering in aggregated arrays
  - Tests for aggregation with actual map task outputs

- [ ] **DSL Support for .map() Step Type**

  - Add `.map()` method to Flow DSL for defining map steps
  - Constraints:
    - Locked to exactly one dependency (enforced at compile time)
    - Dependency must return an array (type-checked)
  - Syntax design:
    - Dependent maps: `flow.map({ slug: 'stepName', array: 'arrayReturningStep' }, handler)`
    - Root maps: Decide between `{ array: 'run' }` or omitting array property
  - Return type always inferred as array
  - Comprehensive tests:
    - Runtime validation of array dependencies
    - Type safety for input/output types
    - Compile-time enforcement of single dependency rule

- [ ] **Integration Tests**

  - End-to-end workflows with real array data
  - Basic happy path coverage
  - This should be minimal and added to the Edge Worker integration test suite for now

- [ ] **Semantic Improvement: NULL for Unknown initial_tasks** (OPTIONAL - Can be deferred)

  - Change initial_tasks from "1 as placeholder" to NULL for dependent map steps
  - Benefits: Semantic correctness (NULL = unknown, not "1 task")
  - Scope: Schema change to allow NULL, update 5+ SQL functions
  - See detailed plan in `pkgs/core/PLAN_use_null_for_map_initial_tasks.md`
  - **Note**: This is a semantic improvement only - current approach works functionally
  - **Warning**: If deferred, new tests for Array Distribution and Output Aggregation will
    assume initial_tasks = 1 for dependent maps, making this change harder later

- [ ] **Migration Consolidation**

  - Remove all temporary/incremental migrations from feature branches
  - Generate a single consolidated migration for the entire map infrastructure
  - Ensure clean migration path from current production schema
  - If NULL improvement is done, include it in the consolidated migration

- [ ] **Graphite Stack Merge**

  - Configure Graphite merge queue for the complete PR stack
  - Ensure all PRs in sequence can be merged together
  - Final validation before merge to main
  - Merge queue to be set such that it verifies only the top PR
    (it is because of CI check for temp migrations)
