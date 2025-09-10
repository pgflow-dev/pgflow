# Phase 2a Implementation Plan: Map Infrastructure (SQL Core)

## Overview

Phase 2a establishes the SQL-level foundation for map step functionality, building on Phase 1's completed `.array()` method. This phase focuses exclusively on the database schema and SQL Core layer, providing the infrastructure needed for parallel task spawning, execution, and result aggregation.

**Dependencies**: Phase 1 (`.array()` method) must be completed  
**Milestone**: Can create map steps and spawn/complete tasks via direct SQL calls

## Core Value Proposition

- **Parallel Task Spawning**: Map steps spawn N tasks based on array dependency length
- **Task Counting Infrastructure**: Robust task counting with complete set of invariants
- **Result Aggregation**: Ordered collection of task results into final array output
- **Queue Infrastructure**: Silent queue column addition (used in Phase 3)
- **Empty Array Handling**: Auto-completion for zero-task scenarios

## Database Schema Changes

### Migration Strategy

Using Atlas migrations with the established pkgs/core/scripts workflow:

```bash
# Navigate to pkgs/core directory
cd pkgs/core

# First update schema files in pkgs/core/schemas/, then generate migration
./scripts/atlas-migrate-diff add_map_infrastructure

# Review generated migration file, then apply and verify
pnpm nx verify-migrations core
```

### Schema Updates

#### 1. Enable Map Step Type

**File**: `pkgs/core/schemas/0050_table_steps.sql`

Update the existing steps table definition to include the new constraint:

```sql
-- In pkgs/core/schemas/0050_table_steps.sql, update the constraint:
CONSTRAINT steps_step_type_check CHECK (step_type IN ('single', 'map'))
```

#### 2. Remove Single Task Constraint

**File**: `pkgs/core/schemas/0060_tables_runtime.sql
`

Remove any existing constraint that limits steps to single task in the table definition:

```sql
-- In pkgs/core/schemas/0060_tables_runtimen.sql, remove or don't include:
-- CONSTRAINT only_single_task_per_step ...
```

## SQL Function Updates

### 1. Update `add_step` Function

**File**: `pkgs/core/schemas/0100_function_add_step.sql`

**Key Changes:**
- Add `step_type TEXT DEFAULT 'single'` parameter
- Add validation: map steps cannot have more than 1 dependency (0 or 1 is allowed)
- Store both parameters in steps table

```sql
CREATE OR REPLACE FUNCTION pgflow.add_step(
  flow_slug TEXT,
  step_slug TEXT,
  step_type TEXT DEFAULT 'single',
  deps_slugs TEXT[] DEFAULT '{}',
  opt_max_attempts INT DEFAULT NULL,
  opt_base_delay INT DEFAULT NULL,
  opt_timeout INT DEFAULT NULL,
  opt_start_delay INT DEFAULT NULL
) 
RETURNS VOID
VOLATILE
SET search_path TO ''
LANGUAGE sql
AS $$
  -- Validate map step constraints
  -- Map steps can have either:
  --   0 dependencies (root map - maps over flow input array)
  --   1 dependency (dependent map - maps over dependency output array)
  SELECT CASE 
    WHEN add_step.step_type = 'map' AND array_length(deps_slugs, 1) > 1
    THEN (SELECT ERROR('Map step "' || add_step.step_slug || '" can have at most one dependency'))
  END;

  INSERT INTO pgflow.steps (
    flow_slug, step_slug, step_type, step_index, deps_count,
    queue,  -- NEW: Store queue setting (unused until Phase 3)
    opt_max_attempts, opt_base_delay, opt_timeout, opt_start_delay
  ) VALUES (
    add_step.flow_slug,
    add_step.step_slug, 
    add_step.step_type,  -- NEW: Store step type
    (
      SELECT COALESCE(MAX(steps.step_index), -1) + 1 
      FROM pgflow.steps
      WHERE steps.flow_slug = add_step.flow_slug
    ),
    array_length(deps_slugs, 1),
    add_step.queue,  -- NEW: Store queue parameter (defaults to NULL)
    add_step.opt_max_attempts,
    add_step.opt_base_delay,
    add_step.opt_timeout,
    add_step.opt_start_delay
  );
  
  -- Insert dependencies (unchanged)
  INSERT INTO pgflow.deps (flow_slug, dep_slug, step_slug)
  SELECT add_step.flow_slug, unnest(deps_slugs), add_step.step_slug
  WHERE deps_slugs IS NOT NULL AND array_length(deps_slugs, 1) > 0;
$$;
```

## Comprehensive Testing Strategy

### Test Structure Overview

Following the established pgflow testing patterns, comprehensive SQL tests will be organized by function:

```
pkgs/core/supabase/tests/
├── add_step/
│   ├── map_step_creation.test.sql           # NEW: Map step creation with step_type parameter
│   ├── step_type_validation.test.sql        # NEW: step_type constraint validation
│   └── queue_parameter_storage.test.sql     # NEW: Queue parameter storage (Phase 3 prep)
├── start_ready_steps/
│   ├── map_task_spawning.test.sql          # NEW: Dynamic task generation for map steps
│   ├── empty_array_handling.test.sql       # NEW: Zero-task auto-completion
│   ├── task_count_calculation.test.sql     # NEW: Task counting logic
│   └── queue_message_routing.test.sql      # NEW: Queue-aware message sending
├── start_tasks/
│   ├── map_input_construction.test.sql     # NEW: Element extraction for map tasks
│   ├── queue_based_filtering.test.sql      # NEW: Queue-based task filtering
│   └── task_index_handling.test.sql        # NEW: task_index in responses
├── complete_task/
│   ├── map_result_aggregation.test.sql     # NEW: Ordered result aggregation
│   ├── task_count_propagation.test.sql     # NEW: Propagation to map dependents
│   ├── empty_array_completion.test.sql     # NEW: Empty array result handling
│   └── task_counting_invariants.test.sql   # NEW: Comprehensive invariant testing
└── schema/
    ├── task_counting_columns.test.sql       # NEW: Column constraints and invariants
    ├── step_type_constraint.test.sql        # NEW: step_type validation
    └── queue_infrastructure.test.sql        # NEW: Queue column infrastructure
```

### Key Test Cases Implementation

## Success Criteria

### Functional Requirements
1. ✅ **Map Step Creation**: `add_step` accepts `step_type='map'` parameter
2. ✅ **Dynamic Task Spawning**: Map steps spawn N tasks based on array length
3. ✅ **Empty Array Handling**: Zero-length arrays auto-complete with `[]` output
4. ✅ **Result Aggregation**: Task outputs aggregated in task_index order
5. ✅ **Task Count Propagation**: Map dependents get correct task counts

### Data Integrity Requirements
3. ✅ **Consistent State Transitions**: Task counts maintained correctly
4. ✅ **Ordered Aggregation**: Results maintain task_index ordering

### Performance Requirements
1. ✅ **Batch Operations**: Task spawning uses efficient generate_series approach

### Testing Requirements
2. ✅ **Invariant Testing**: Task counting constraints thoroughly tested
3. ✅ **Edge Case Coverage**: Empty arrays, large arrays, error scenarios
4. ✅ **Integration Testing**: Multi-step workflows validated

## Risk Mitigation

### Identified Risks

**Risk 1: Performance Impact**
- **Mitigation**: Efficient SQL patterns (generate_series, batch operations)
- **Testing**: Performance validation with large arrays (1000+ elements)

**Risk 3: Empty Array Edge Cases**
- **Mitigation**: Explicit auto-completion logic and dedicated testing
- **Testing**: Comprehensive empty array scenario coverage
- **Validation**: End-to-end empty array workflow testing
