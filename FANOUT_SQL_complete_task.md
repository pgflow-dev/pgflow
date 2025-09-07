# complete_task Changes for Fanout Support

## Overview

The `complete_task` function needs to detect when a completed task feeds into fanout steps and set the `initial_tasks` count for those dependents.

## Architecture Principle

**Separation of Concerns Between Generated and User Steps**

### array Step Responsibilities
- Execute user's array function
- Validate result meets requirements (is array, within size limits)
- Handle edge cases (empty arrays) based on `empty_array_mode`
- **Outcome**: succeed/fail/skip based on validation
- **Error attribution**: Preprocessing errors belong to array step

### map Step Responsibilities  
- Receive **guaranteed valid array** from array dependency
- Spawn N tasks from array (including 0 tasks for empty arrays)
- Aggregate results back into ordered array
- **Never** deals with validation - array step already handled it

## Schema Changes

### New Columns: Task Tracking for Dynamic Fanout
```sql
ALTER TABLE pgflow.step_states 
ADD COLUMN initial_tasks int DEFAULT 1 CHECK (initial_tasks >= 0),
ADD COLUMN total_tasks int DEFAULT 1 CHECK (total_tasks >= 0),
ADD COLUMN remaining_tasks int DEFAULT 1 CHECK (remaining_tasks >= 0);

-- Add integrity constraints between task counters
ALTER TABLE pgflow.step_states
ADD CONSTRAINT total_tasks_gte_initial CHECK (total_tasks >= initial_tasks),
ADD CONSTRAINT total_tasks_gte_remaining CHECK (total_tasks >= remaining_tasks),
ADD CONSTRAINT remaining_tasks_lte_total CHECK (remaining_tasks <= total_tasks);

-- Semantics:
-- initial_tasks: Tasks spawned from original array (never changes, audit trail)
-- total_tasks: Current total including appended tasks (updates on append)  
-- remaining_tasks: Tasks not yet completed (decrements on complete, increments on append)
-- Progress calculation: (total_tasks - remaining_tasks) / total_tasks
-- Invariants: total_tasks >= initial_tasks >= 0, total_tasks >= remaining_tasks >= 0
```

### New Column: skip_reason
```sql
ALTER TABLE pgflow.step_states
ADD COLUMN skip_reason text;

-- Used when status = 'skipped' to track why (empty_array, condition_false, etc.)
```

### Step Type Updates
```sql
-- Update step_type to include array and fanout types
check (step_type in ('single', 'array', 'fanout'))
```

### Empty Array Handling Configuration
```sql
ALTER TABLE pgflow.steps
ADD COLUMN empty_array_mode text DEFAULT 'fail' CHECK (empty_array_mode IN ('fail', 'skip', 'complete')),
ADD COLUMN max_fanout_tasks int DEFAULT 1000 CHECK (max_fanout_tasks > 0);
```

## complete_task Logic Changes

### 1. Detect Map Dependents
```sql
-- Check if completed task feeds any map steps
dependent_map_steps AS (
  SELECT dep.step_slug as map_step_slug
  FROM pgflow.deps dep
  JOIN pgflow.steps step ON 
    step.flow_slug = dep.flow_slug AND 
    step.step_slug = dep.step_slug  
  WHERE dep.flow_slug = complete_task.flow_slug
    AND dep.dep_slug = complete_task.step_slug  -- This completed step
    AND step.step_type = 'map'
)
```

### 2. Set Task Counters
```sql
-- For map dependents, set task counters from array length
UPDATE pgflow.step_states 
SET 
  initial_tasks = jsonb_array_length(completed_output),
  total_tasks = jsonb_array_length(completed_output),
  remaining_tasks = jsonb_array_length(completed_output)
FROM (
  SELECT output FROM pgflow.step_tasks 
  WHERE run_id = complete_task.run_id 
    AND step_slug = complete_task.step_slug
    AND status = 'completed'
) AS completed_output
WHERE step_states.run_id = complete_task.run_id
  AND step_states.step_slug IN (SELECT map_step_slug FROM dependent_map_steps);
```

## Validation Strategy

### In complete_task (SQL)
array validation and fanout setup:
```sql
-- array step validates its own output and handles failures/skips
CASE 
  WHEN step.step_type = 'array' THEN
    CASE 
      WHEN jsonb_typeof(output) != 'array' THEN 
        UPDATE step_states SET status='failed', failure_reason='preprocessing_error'
      WHEN jsonb_array_length(output) = 0 AND empty_array_mode = 'fail' THEN
        UPDATE step_states SET status='failed', failure_reason='preprocessing_error'  
      WHEN jsonb_array_length(output) = 0 AND empty_array_mode = 'skip' THEN
        UPDATE step_states SET status='skipped', skip_reason='empty_array'
      ELSE
        -- array succeeds, set task counts for map dependents
        UPDATE map_dependents SET 
          initial_tasks = jsonb_array_length(output),
          total_tasks = jsonb_array_length(output),
          remaining_tasks = jsonb_array_length(output)
    END
END
```

## Error Handling Integration

### Failure Reasons (from @FAILURE_REASONS.md)
- **step_type='array'**: Use `preprocessing_error` for array validation failures
- **step_type='single'**: Use `error` for normal execution failures  
- **step_type='map'**: Use `task_error`/`task_timeout` when aggregating from failed tasks

### Skip Handling (from @SKIPPING.md)
- **Empty arrays with skip mode**: Set `status = 'skipped'`, `skip_reason = 'empty_array'`
- **Skip propagation**: Downstream steps handle missing dependency based on skip_mode

## Benefits

1. **Clean separation**: Validation in array step, counting in complete_task
2. **Explicit semantics**: initial_tasks vs total_tasks vs remaining_tasks  
3. **Configurable behavior**: empty_array_mode, max_fanout_tasks
4. **Proper error attribution**: preprocessing_error for array step failures
5. **Skip integration**: Works with upcoming conditional skip model