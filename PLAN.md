# Map Infrastructure (SQL Core)

**NOTE: This PLAN.md file should be removed in the final PR once all map infrastructure is complete.**

### Features

- ✅ **DONE**: Empty array maps (taskless) cascade and complete correctly
- ✅ **DONE**: Task spawning creates N tasks with correct indices
- ✅ **DONE**: Dependency count propagation for map steps
- ✅ **DONE**: Array element extraction - tasks receive individual array elements
- ✅ **DONE**: Output aggregation - inline implementation aggregates map task outputs for dependents
- ✅ **DONE**: DSL support for `.map()` for defining map steps with compile-time duplicate detection
- ✅ **DONE**: Fix orphaned messages on run failure
- ⏳ **TODO**: Performance optimization with step_states.output column

### Chores

- ⏳ **TODO**: Integration tests for map steps
- ⏳ **TODO**: Update core README
- ⏳ **TODO**: Add docs page for array and map steps
- ⏳ **TODO**: Migration consolidation
- ⏳ **TODO**: Graphite stack merge

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

- [x] **PR #213: NULL for Unknown initial_tasks** - `09-16-make-initial-tasks-nullable`

  - Changed initial_tasks from "1 as placeholder" to NULL for dependent map steps
  - Benefits: Semantic correctness (NULL = unknown, not "1 task")
  - Implemented: Schema change to allow NULL, updated all SQL functions
  - Added validation for non-array and NULL outputs to map steps
  - Comprehensive tests for NULL behavior and error cases

- [x] **PR #216: Array Element Distribution** (CRITICAL - BLOCKS REAL MAP USAGE)

  - Enhanced start_tasks() to distribute array elements to map tasks
  - Each map task receives its specific array element based on task_index
  - Handles both root maps (from run input) and dependent maps (from step outputs)
  - Tests with actual array data processing

- [x] **PR #217: Output Aggregation** - `09-17-add-map-step-output-aggregation` (THIS PR)

  - Inline aggregation implementation in complete_task, start_tasks, maybe_complete_run
  - Full test coverage (17 tests) for all aggregation scenarios
  - Handles NULL preservation, empty arrays, order preservation
  - Validates non-array outputs to map steps fail correctly
  - Fixed broadcast aggregation to send full array not individual task output

- [x] **PR #218: DSL Support for .map() Step Type** - `09-18-add-map-support-to-dsl` ✅ COMPLETED

  - Added `.map()` method to Flow DSL for defining map steps
  - Constraints:
    - Locked to exactly one dependency (enforced at compile time)
    - Dependency must return an array (type-checked)
  - Syntax design:
    - Dependent maps: `flow.map({ slug: 'stepName', array: 'arrayReturningStep' }, handler)`
    - Root maps: Omit array property
  - Return type always inferred as array
  - Comprehensive tests:
    - Runtime validation of array dependencies
    - Type safety for input/output types
    - Compile-time enforcement of single dependency rule
  - Fixed complex TypeScript type inference issue with overloads
  - Added compile-time duplicate slug detection across all DSL methods
  - Fixed all linting errors (replaced `{}` with `Record<string, never>`)
  - Updated DSL README with .map() documentation
  - Created detailed changeset

- [x] **PR #219: Fix Orphaned Messages on Run Failure** - `09-18-fix-orphaned-messages-on-fail` ✅ COMPLETED

  - Archives all queued messages when run fails (prevents orphaned messages)
  - Handles type constraint violations gracefully without exceptions
  - Added guards to prevent any mutations on failed runs:
    - complete_task returns unchanged
    - start_ready_steps exits early
    - cascade_complete_taskless_steps returns 0
  - Added performance index for efficient message archiving
  - Tests unstashed and passing (archive_sibling_map_tasks, archive_messages_on_type_constraint_failure)
  - Updated core README with failure handling mentions
  - **Critical fix: prevents queue performance degradation in production**

#### ❌ Remaining Work (Priority Order)

- [ ] **Integration Tests**

  - End-to-end workflows with real array data
  - Basic happy path coverage
  - This should be minimal and added to the Edge Worker integration test suite for now

- [ ] **Performance Optimization - step_states.output Column**

  - Migrate from inline aggregation to storing outputs in step_states
  - See detailed plan: [PLAN_step_output.md](./PLAN_step_output.md)
  - Benefits:
    - Eliminate redundant aggregation queries
    - 30-70% performance improvement for map chains
    - Cleaner architecture with single source of truth
  - Implementation:
    - Add output column to step_states table
    - Update complete_task to populate output on completion
    - Simplify consumers (start_tasks, maybe_complete_run, broadcasts)
    - Update all aggregation tests (~17 files)
  - **Note**: This is an optimization that should be done after core functionality is stable

- [ ] **Update `pkgs/core/README.md`**

  - Add new section describing the step types
  - Describe single step briefly, focus on describing map step type and how it differs
  - Make sure to mention that maps are constrained to have exactly one dependency
  - Show multiple cases of inputs -> task creation
  - Explain edge cases (empty array propagation, invalid array input)
  - Explain root map vs dependent map and how it gets handled and what restrictions those apply on the Flow input
  - Explain cascade completion of taskless steps and its limitations

- [ ] **Add docs page**

  - put it into `pkgs/website/src/content/docs/concepts/array-and-map-steps.mdx`
  - describe the DSL and how the map works and why we need it
  - show example usage of root map
  - show example usage of dependent map
  - focus mostly on how to use it, instead of how it works under the hood
  - link to the README's for more details

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
