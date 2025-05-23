# pgflow Fanout Feature Implementation Plan

## Overview
This plan details the implementation of the fanout feature for pgflow, allowing parallel processing of array items within a workflow. The approach uses a boolean `fanout: true` flag in the DSL to minimize complexity while enabling powerful parallelization capabilities.

## Phase 1: Database Schema Changes

### 1.1 Add step_type column to pgflow.steps
**File**: Create new migration file
```sql
-- Add step_type column with default 'single'
ALTER TABLE pgflow.steps
  ADD COLUMN IF NOT EXISTS step_type TEXT NOT NULL DEFAULT 'single';

-- Drop existing constraint if it exists
ALTER TABLE pgflow.steps
  DROP CONSTRAINT IF EXISTS step_type_check;

-- Add new constraint allowing 'single' or 'fanout'
ALTER TABLE pgflow.steps
  ADD CONSTRAINT step_type_check
  CHECK (step_type IN ('single', 'fanout'));
```

### 1.2 Remove single task constraint
**File**: Modify `0060_tables_runtime.sql`
```sql
-- Remove the constraint that forces task_index = 0
ALTER TABLE pgflow.step_tasks
  DROP CONSTRAINT IF EXISTS only_single_task_per_step;
```

## Phase 2: SQL Function Updates

### 2.1 Update pgflow.add_step
**File**: `0100_function_add_step.sql`
- Add parameter: `p_step_type TEXT DEFAULT 'single'`
- Store step_type in the INSERT statement
- Validate that fanout steps have exactly one dependency

### 2.2 Create spawn_fanout_tasks helper
**File**: New function file
```sql
CREATE OR REPLACE FUNCTION pgflow.spawn_fanout_tasks(
  p_run_id UUID,
  p_step_slug TEXT
) RETURNS VOID AS $$
DECLARE
  v_dependency_output JSONB;
  v_array_length INT;
  i INT;
BEGIN
  -- Get the single dependency's output
  -- Validate it's an array
  -- Create N step_tasks with task_index 0..N-1
  -- Send N PGMQ messages
END
$$ LANGUAGE plpgsql;
```

### 2.3 Update pgflow.poll_for_tasks
**File**: `0090_function_poll_for_tasks.sql`
- Modify the payload construction logic:
  - For `step_type = 'single'`: Current behavior (include run and deps)
  - For `step_type = 'fanout'`: Only include `{ item: <array_element> }`
- Use `task_index` to select the appropriate array element

### 2.4 Update pgflow.start_ready_steps
**File**: `0100_function_start_ready_steps.sql`
- Check if completed step has dependent fanout steps
- Call `spawn_fanout_tasks` for fanout steps instead of normal task creation

### 2.5 Update pgflow.complete_task
**File**: `0100_function_complete_task.sql`
- For fanout steps, check if all tasks are complete
- Aggregate outputs into ordered array when fanout step completes

## Phase 3: TypeScript DSL Updates

### 3.1 Type definitions
**File**: `pkgs/dsl/src/dsl.ts`
```typescript
// Add to StepOptions interface
export interface StepOptions {
  slug: string;
  dependsOn?: string[];
  fanout?: boolean;
  maxAttempts?: number;
  baseDelaySeconds?: number;
  timeoutSeconds?: number;
}

// Add type constraint for fanout dependencies
type ValidateFanoutDeps<TDeps, TFanout> = 
  TFanout extends true
    ? TDeps extends readonly [infer Single]
      ? StepOutput<Single> extends Json[]
        ? unknown
        : "Fanout dependency must return an array"
      : "Fanout steps must have exactly one dependency"
    : unknown;

// Add fanout input type
type FanoutInput<TItem> = { item: TItem };
```

### 3.2 Update Flow.step method
**File**: `pkgs/dsl/src/dsl.ts`
- Add validation for fanout constraints:
  - Must have exactly one dependency
  - Dependency must return an array
  - Cannot be a root step
- Adjust input type for fanout handlers to only receive `{ item }`

### 3.3 Update compile-flow
**File**: `pkgs/dsl/src/compile-flow.ts`
- Pass `step_type` parameter to SQL based on `fanout` option
- Default to 'single' when fanout is not specified

## Phase 4: Error Handling

### 4.1 Validation errors
- DSL compile-time: TypeScript errors for invalid fanout configuration
- Runtime: SQL exceptions for non-array dependencies

### 4.2 Execution errors
- Individual task failures follow existing retry logic
- Any permanently failed task fails the entire fanout step
- Fanout step failure cascades to run failure

## Phase 5: Testing Strategy

### 5.1 SQL Tests (PgTAP)
**Location**: `pkgs/core/supabase/tests/`
- Test step_type column and constraints
- Test spawn_fanout_tasks function
- Test fanout payload construction in poll_for_tasks
- Test output aggregation in complete_task
- Test error scenarios (non-array dependency, failed tasks)

### 5.2 TypeScript Tests (Vitest)
**Location**: `pkgs/dsl/__tests__/`
- Test type constraints for fanout steps
- Test compilation of fanout steps to SQL
- Test input type inference for fanout handlers

### 5.3 Integration Tests
- End-to-end fanout workflow execution
- Performance tests with large arrays
- Concurrent execution verification

## Phase 6: Documentation

### 6.1 User Guide
- Explain prepare-then-fanout pattern
- Provide examples of common use cases
- Document limitations and best practices

### 6.2 API Reference
- Document fanout option in DSL
- Update SQL function documentation

## Implementation Order

1. **Database changes first** (Phase 1)
   - Safe to deploy as they're backward compatible
   
2. **SQL functions** (Phase 2)
   - Deploy in order: add_step, spawn_fanout_tasks, poll_for_tasks, start_ready_steps, complete_task
   
3. **DSL updates** (Phase 3)
   - Can be developed in parallel with SQL changes
   - Deploy after SQL functions are ready
   
4. **Testing** (Phase 5)
   - Write tests alongside each component
   - Integration tests after all components ready
   
5. **Documentation** (Phase 6)
   - Update as features are implemented

## Migration Notes

- All changes are backward compatible
- Existing flows continue to work unchanged
- New fanout functionality is opt-in via `fanout: true`

## Future Enhancements (Not in MVP)

- Syntactic sugar: `fanout: 'items'` for path-based fanout
- `.map()` helper method
- Inline generator functions
- Batch size limits
- Progress tracking
- Dynamic array generation

These can all compile down to the same primitive fanout mechanism implemented here.