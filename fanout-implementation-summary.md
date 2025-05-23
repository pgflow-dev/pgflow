# pgflow Fanout Feature Implementation Summary

## Overview
This document summarizes the implementation of the fanout feature for pgflow, which allows parallel processing of array items within a workflow.

## Changes Made

### 1. Database Schema Changes

#### Added step_type column to pgflow.steps table
- **File**: `pkgs/core/schemas/0050_tables_definitions.sql`
- Added `step_type text not null default 'single'` column
- Added constraint: `check (step_type in ('single', 'fanout'))`

#### Removed single task constraint
- **File**: `pkgs/core/schemas/0060_tables_runtime.sql`
- Commented out `constraint only_single_task_per_step check (task_index = 0)`
- Added trigger function to validate task_index based on step_type

### 2. SQL Function Updates

#### Updated pgflow.add_step
- **File**: `pkgs/core/schemas/0100_function_add_step.sql`
- Added `step_type text default 'single'` parameter
- Added validation for fanout constraints:
  - Must have exactly one dependency
  - Cannot be a root step

#### Created pgflow.spawn_fanout_tasks
- **File**: `pkgs/core/schemas/0100_function_spawn_fanout_tasks.sql`
- Declarative function to spawn multiple tasks for fanout steps
- Validates dependency output is an array
- Creates N tasks with indices 0..N-1
- Sends batch messages to PGMQ

#### Updated pgflow.poll_for_tasks
- **File**: `pkgs/core/schemas/0090_function_poll_for_tasks.sql`
- Added step_type and fanout_dep_slug to task selection
- Modified input construction:
  - For fanout: `{ item: <array_element> }`
  - For single: Current behavior with run and deps

#### Updated pgflow.start_ready_steps
- **File**: `pkgs/core/schemas/0100_function_start_ready_steps.sql`
- Converted to plpgsql for handling different step types
- Single steps: Create one task with index 0
- Fanout steps: Call spawn_fanout_tasks

#### Updated pgflow.complete_task
- **File**: `pkgs/core/schemas/0100_function_complete_task.sql`
- Added fanout aggregation logic
- When fanout step completes all tasks, aggregates outputs into ordered array

#### Updated pgflow.maybe_complete_run
- **File**: `pkgs/core/schemas/0100_function_maybe_complete_run.sql`
- Modified to use step_states.output for fanout steps
- Uses step_tasks.output for single steps

#### Added pgflow.raise_exception helper
- **File**: `pkgs/core/schemas/0030_utilities.sql`
- Helper function to raise exceptions in SQL contexts

### 3. TypeScript DSL Updates

#### Updated type definitions
- **File**: `pkgs/dsl/src/dsl.ts`
- Added `fanout?: boolean` to StepDefinition interface
- Added fanout validation in step method:
  - Must have exactly one dependency
  - Runtime error if constraints violated

#### Updated compile-flow
- **File**: `pkgs/dsl/src/compile-flow.ts`
- Modified to pass `step_type => 'fanout'` parameter when fanout is true
- Updated SQL generation to use named parameters

#### Created example flow
- **File**: `pkgs/dsl/src/example-fanout-flow-simple.ts`
- Simple example demonstrating fanout with number array processing

## Usage Example

```typescript
const flow = new Flow({ slug: 'process-items' })
  // Step 1: Create array
  .step(
    { slug: 'create-array', dependsOn: [] },
    async () => [1, 2, 3, 4, 5]
  )
  // Step 2: Process each item in parallel
  .step(
    { 
      slug: 'process-item', 
      dependsOn: ['create-array'], 
      fanout: true 
    },
    async (input: any) => {
      const { item } = input;
      return item * 2;
    }
  )
  // Step 3: Aggregate results
  .step(
    { slug: 'sum-results', dependsOn: ['process-item'] },
    async (input: any) => {
      const results = input['process-item'];
      return results.reduce((sum: number, n: number) => sum + n, 0);
    }
  );
```

## Key Design Decisions

1. **Boolean flag approach**: Used `fanout: true` instead of new DSL constructs for simplicity
2. **Reuse existing tables**: No new tables, only added step_type column
3. **Declarative SQL**: Used CTEs and batch operations instead of loops
4. **Type safety tradeoff**: Simplified TypeScript types for initial implementation
5. **Prepare-then-fanout pattern**: Users create array in one step, fanout in next

## Future Enhancements

1. **Better TypeScript types**: Add proper type inference for fanout handlers
2. **Syntactic sugar**: Add convenience methods like `.map()`
3. **Path-based fanout**: Support `fanout: 'items'` to fanout over nested arrays
4. **Progress tracking**: Add ability to track fanout progress
5. **Batch size limits**: Add max concurrent tasks per fanout

## Testing Needed

1. SQL unit tests (PgTAP) for all modified functions
2. TypeScript unit tests for DSL changes
3. Integration tests for end-to-end fanout workflows
4. Performance tests with large arrays
5. Error handling tests (non-array dependency, failed tasks)