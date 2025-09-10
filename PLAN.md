# Map Infrastructure (SQL Core)

## Implementation Status

### Sequential Child PR Plan

- [x] **PR #207: Add .array() to DSL** - `feature-map-and-array`
  - TypeScript DSL enhancement for array creation
  - Foundation for map step functionality
- [x] **PR #208: Foundation - Schema & add_step()** - `09-10-feat_add_map_step_type_in_sql` (CURRENT PR)

  - Schema changes (initial_tasks, remaining_tasks, constraints)
  - add_step() function with map step validation
  - Basic tests for map step creation

- [ ] **PR #209: Root Map Support** - `09-11-root-map-support`

  - Enhanced start_flow() for root map validation and count setting
  - Tests for root map scenarios

- [ ] **PR #210: Task Spawning** - `09-12-task-spawning`

  - Enhanced start_ready_steps() for N task generation
  - Empty array auto-completion
  - Tests for batch task creation

- [ ] **PR #211: Array Element Extraction** - `09-13-array-extraction`

  - Enhanced start_tasks() for map input extraction
  - Support for root and dependent maps
  - Tests for element extraction

- [ ] **PR #212: Dependent Map Support** - `09-14-dependent-map`

  - Enhanced complete_task() for map dependency handling
  - Array validation and count propagation
  - Tests for dependency scenarios

- [ ] **PR #213: Output Aggregation** - `09-15-output-aggregation`

  - Enhanced maybe_complete_run() for array aggregation
  - Ordered output collection
  - Tests for aggregation

- [ ] **PR #214: Integration Tests** - `09-16-integration-tests`
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

### Migration Strategy

Using Atlas migrations with the established pkgs/core/scripts workflow:

#### Initial Migration Generation

```bash
# Navigate to pkgs/core directory
cd pkgs/core

# First update schema files in pkgs/core/schemas/, then generate migration
./scripts/atlas-migrate-diff add_map_step_type

# Review generated migration file, then apply and verify
pnpm nx verify-migrations core
```

#### Regenerating Migration After Schema Updates

```bash
# 1. Decide on migration name
migration_name=add_map_step_type

# 1. Remove the previous version of the migration file
git rm -f supabase/migrations/*_pgflow_${migration_name}.sql

# 2. Reset the Atlas hash to allow regeneration
./scripts/atlas-migrate-hash --yes

# 3. reset database state to pre-migration
pnpm nx supabase:reset core

# 4. Update schema files in pkgs/core/schemas/ as needed (or if already updated, skip this step)

# 5. generate the migration with the same name
./scripts/atlas-migrate-diff ${migration_name}

# 6. verify the migration
pnpm nx verify-migrations core
```

**Key Points:**

- START WITH REMOVING PREVIOUS MIGRATION FILE BEFORE REGENERATING TO AVOID CONFLICTS !!!!
- Always use the same migration name (`add_map_step_type`) for the entire PR
- do not include `pgflow_` prefix when genrating migration - it is included by atlas-migrate-diff automatically
- Reset Atlas hash before regeneration to allow the same name to be used
- This maintains a single, comprehensive migration per PR

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

### 2. `start_flow()` - Root Map Count Setting (TODO: PR #209)

**File**: `pkgs/core/schemas/0100_function_start_flow.sql`

**Required Changes:**

- Detect root map steps (step_type='map' AND deps_count=0)
- Validate that `runs.input` is an array for root maps
- Set `initial_tasks = jsonb_array_length(input)` for root maps
- Fail with clear error if input is not array for root map

### 3. `complete_task()` - Dependent Map Count Setting (TODO: PR #212)

**File**: `pkgs/core/schemas/0100_function_complete_task.sql`

**Required Changes:**

- Detect map dependents when a step completes
- For single→map: validate output is array, set `initial_tasks = array_length`
- For map→map: count completed tasks, set `initial_tasks = task_count`
- Fail with clear error if dependency output is not array when needed

### 4. `start_ready_steps()` - Task Spawning (TODO: PR #210)

**File**: `pkgs/core/schemas/0100_function_start_ready_steps.sql`

**Required Changes:**

- Generate N tasks using `generate_series(0, initial_tasks-1)` for map steps
- Handle empty arrays: direct transition to 'completed' when initial_tasks=0
- Send appropriate realtime events (step:started or step:completed)
- Insert multiple step_tasks records with proper task_index values

**Key Decision - Empty Array Handling:**

- Transition directly `created` → `completed` for initial_tasks=0
- Send single `step:completed` event with `output: []`

### 5. `start_tasks()` - Array Element Extraction (TODO: PR #211)

**File**: `pkgs/core/schemas/0120_function_start_tasks.sql`

**Required Changes:**

- Extract array elements based on task_index for map steps
- Root maps: extract from `runs.input[task_index]`
- Dependent maps: extract from aggregated dependency output
- Single steps: unchanged behavior (keep existing logic)

### 6. `maybe_complete_run()` - Output Aggregation (TODO: PR #213)

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

**PR #209-214:** Each PR will include its own comprehensive test suite covering:

- Function-specific tests
- Edge cases and error handling
- Integration with existing functionality

**PR #214:** Final integration test suite covering end-to-end workflows

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
