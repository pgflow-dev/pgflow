# Map Infrastructure (SQL Core)

**NOTE: This PLAN.md file should be removed in the final PR once all map infrastructure is complete.**

## Implementation Status

### Sequential Child PR Plan

- [x] **PR #207: Add .array() to DSL** - `feature-map-and-array`
  - TypeScript DSL enhancement for array creation
  - Foundation for map step functionality
- [x] **PR #208: Foundation - Schema & add_step()** - `09-10-feat_add_map_step_type_in_sql`
  - Schema changes (initial_tasks, remaining_tasks, constraints)
  - add_step() function with map step validation
  - Basic tests for map step creation
- [x] **PR #209: Root Map Support** - `09-11-root-map-support` (COMPLETED)

  - Enhanced start_flow() for root map validation and count setting
  - Tests for root map scenarios

- [ ] **Task Spawning**

  - Enhanced start_ready_steps() for N task generation
  - Empty array auto-completion
  - Tests for batch task creation

- [ ] **Array Element Extraction**

  - Enhanced start_tasks() for map input extraction
  - Support for root and dependent maps
  - Tests for element extraction

- [ ] **Dependent Map Support**

  - Enhanced complete_task() for map dependency handling
  - Array validation and count propagation
  - Tests for dependency scenarios

- [ ] **Output Aggregation**

  - Enhanced maybe_complete_run() for array aggregation
  - Ordered output collection
  - Tests for aggregation

- [ ] **Integration Tests**
  - End-to-end test suite
  - Edge case coverage
  - Performance validation

## Overview

This implementation establishes the SQL-level foundation for map step functionality, building on PR #207's completed `.array()` method. It focuses exclusively on the database schema and SQL Core layer, providing the infrastructure needed for parallel task spawning, execution, and result aggregation.

**Dependencies**: PR #207 (`.array()` method) must be completed  
**Milestone**: Can create map steps and spawn/complete tasks via direct SQL calls

## Core Value Proposition

- **Parallel Task Spawning**: Map steps spawn N tasks based on array dependency length
- **Task Counting Infrastructure**: Robust task counting with complete set of invariants
- **Result Aggregation**: Ordered collection of task results into final array output
- **Empty Array Handling**: Auto-completion for zero-task scenarios

## Hybrid Strategy: "Fresh Data" vs "Dumb Spawning"

The implementation uses a hybrid approach that separates **"count determination"** from **"task spawning"** for optimal performance and maintainability.

### Key Principle

**Determine task counts where data is naturally available, spawn tasks where it's most efficient.**

### Fresh Data Functions

Functions that have access to fresh array data handle validation and count setting:

- **`start_flow()`**: Has fresh `runs.input` → validate and set `initial_tasks` for root maps
- **`complete_task()`**: Has fresh `output` → validate and set `initial_tasks` for dependent maps

### Dumb Functions

Functions that use pre-computed counts without JSON parsing:

- **`start_ready_steps()`**: Copies `initial_tasks → remaining_tasks` and spawns N tasks efficiently
- **`start_tasks()`**: Extracts array elements using `task_index`
- **`maybe_complete_run()`**: Aggregates results into ordered arrays

### Benefits

1. **Minimal JSON Parsing**: Array parsing happens exactly twice - once in each "fresh data" function
2. **Performance Predictable**: No duplicate work or re-reading large arrays
3. **Clean Separation**: Each function has focused responsibility
4. **Atomic Operations**: Count setting happens under existing locks

## Implementation Components

The implementation is split across multiple PRs as shown in the Sequential Child PR Plan above. Each PR builds on the previous one to deliver complete map step functionality.

## Database Schema Changes

For detailed schema development workflow, migration generation, and regeneration instructions, see:

- `.claude/schema_development.md` - Concise workflow guide

### Schema Updates (DONE)

#### 1. Enable Map Step Type (DONE)

**File**: `pkgs/core/schemas/0050_tables_definitions.sql`

- Updated constraint to allow 'map' step type

#### 2. Remove Single Task Constraint (DONE)

**File**: `pkgs/core/schemas/0060_tables_runtime.sql`

- Removed `only_single_task_per_step` constraint

#### 3. Add Initial Tasks Column and Update Remaining Tasks (DONE)

**File**: `pkgs/core/schemas/0060_tables_runtime.sql`

- Added `initial_tasks` column with DEFAULT 1
- Made `remaining_tasks` nullable
- Added `remaining_tasks_state_consistency` constraint

## Function Changes

### 1. `add_step()` - Map Step Creation (DONE)

**File**: `pkgs/core/schemas/0100_function_add_step.sql`

**Completed Changes:**

- Added `step_type TEXT DEFAULT 'single'` parameter
- Added validation for map steps (max 1 dependency)
- Function now stores step_type in database

### 2. `start_flow()` - Root Map Count Setting (CURRENT PR)

**File**: `pkgs/core/schemas/0100_function_start_flow.sql`

**Required Changes:**

- Detect root map steps (step_type='map' AND deps_count=0)
- Validate that `runs.input` is an array for root maps
- Set `initial_tasks = jsonb_array_length(input)` for root maps
- Fail with clear error if input is not array for root map

### 3. `complete_task()` - Dependent Map Count Setting (TODO)

**File**: `pkgs/core/schemas/0100_function_complete_task.sql`

**Required Changes:**

- Detect map dependents when a step completes
- For single→map: validate output is array, set `initial_tasks = array_length`
- For map→map: count completed tasks, set `initial_tasks = task_count`
- Fail with clear error if dependency output is not array when needed

### 4. `start_ready_steps()` - Task Spawning (TODO)

**File**: `pkgs/core/schemas/0100_function_start_ready_steps.sql`

**Required Changes:**

- Generate N tasks using `generate_series(0, initial_tasks-1)` for map steps
- Handle empty arrays: direct transition to 'completed' when initial_tasks=0
- Send appropriate realtime events (step:started or step:completed)
- Insert multiple step_tasks records with proper task_index values

**Key Decision - Empty Array Handling:**

- Transition directly `created` → `completed` for initial_tasks=0
- Send single `step:completed` event with `output: []`

### 5. `start_tasks()` - Array Element Extraction (TODO)

**File**: `pkgs/core/schemas/0120_function_start_tasks.sql`

**Required Changes:**

- Extract array elements based on task_index for map steps
- Root maps: extract from `runs.input[task_index]`
- Dependent maps: extract from aggregated dependency output
- Single steps: unchanged behavior (keep existing logic)

### 6. `maybe_complete_run()` - Output Aggregation (TODO)

**File**: `pkgs/core/schemas/0100_function_maybe_complete_run.sql`

**Required Changes:**

- Aggregate map step outputs into arrays ordered by `task_index`
- Single steps: unchanged (single output value)
- Maintain run output structure: `{step1: output1, mapStep: [item1, item2, ...]}`

## Testing Strategy

### Tests by PR

**PR #208 (DONE):**

- map_step_creation.test.sql
- step_type_validation.test.sql
- map_dependency_limit.test.sql
- map_step_with_no_deps.test.sql

**PR #209 (CURRENT):**

- root_map_array_validation.test.sql
- root_map_initial_tasks.test.sql
- mixed_step_types.test.sql
- multiple_root_maps.test.sql
- null_input_validation.test.sql
- large_array_handling.test.sql
- nested_array_handling.test.sql
- mixed_type_arrays.test.sql
- invalid_json_types.test.sql
- flow_only_maps.test.sql

**Subsequent PRs:** Each will include its own comprehensive test suite covering:

- Function-specific tests
- Edge cases and error handling
- Integration with existing functionality

**Final PR:** Integration test suite covering end-to-end workflows

## Edge Cases Handled

### 1. Empty Arrays

- Root maps: detected in `start_flow()`, `remaining_tasks = 0` → auto-complete in `start_ready_steps()`
- Dependent maps: `remaining_tasks = 0` set in `complete_task()` → auto-complete in `start_ready_steps()`

### 2. Array Validation

- Root maps: validate `runs.input` is array in `start_flow()`
- Dependent maps: validate dependency output is array in `complete_task()`
- Both: fail fast with clear error messages

### 3. Map→Map Dependencies

- Parent map has N completed tasks
- Child map gets `initial_tasks = N` (count of parent tasks)
- Each child task reads from aggregated parent array using `task_index`
- Simple aggregation approach (no optimization needed for MVP)

### 4. Non-Map Dependents of Maps

- Single step depending on map step gets aggregated array
- Built on-demand in `start_tasks()`: `jsonb_agg(output ORDER BY task_index)`
- Preserves array ordering

### 5. Failure Semantics

- Array validation failures: immediately fail step with clear error
- Individual task failures: follow normal retry → task fail → step fail → run fail
- Empty arrays: auto-complete successfully (not failures)

## Performance Optimizations

1. **Minimal JSON Parsing**: Array parsing happens exactly twice - once in each "fresh data" function
2. **Batch Operations**: Use `generate_series()` for efficient task creation
3. **Atomic Updates**: Leverage existing locks and transactions
4. **On-Demand Aggregation**: Only aggregate when needed for non-map dependents
5. **Simple Aggregation**: Map→map uses consistent aggregation approach for clarity

## Success Criteria

### Functional Requirements

1. ✅ **Map Step Creation**: `add_step` accepts `step_type='map'` parameter
2. ✅ **Dynamic Task Spawning**: Map steps spawn N tasks based on array length
3. ✅ **Empty Array Handling**: Zero-length arrays auto-complete with `[]` output
4. ✅ **Result Aggregation**: Task outputs aggregated in task_index order
5. ✅ **Task Count Propagation**: Map dependents get correct task counts

### Data Integrity Requirements

1. ✅ **Consistent State Transitions**: Task counts maintained correctly
2. ✅ **Ordered Aggregation**: Results maintain task_index ordering

### Performance Requirements

1. ✅ **Batch Operations**: Task spawning uses efficient generate_series approach

### Testing Requirements

1. ✅ **Invariant Testing**: Task counting constraints thoroughly tested
2. ✅ **Edge Case Coverage**: Empty arrays, large arrays, error scenarios
3. ✅ **Integration Testing**: Multi-step workflows validated

## Risk Mitigation

### Identified Risks

**Risk 1: Performance Impact**

- **Mitigation**: Efficient SQL patterns (generate_series, batch operations)
- **Testing**: Performance validation with large arrays (1000+ elements)

**Risk 2: Empty Array Edge Cases**

- **Mitigation**: Explicit auto-completion logic and dedicated testing
- **Testing**: Comprehensive empty array scenario coverage
- **Validation**: End-to-end empty array workflow testing
