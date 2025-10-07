# Plan: Use NULL for Unknown initial_tasks in Dependent Map Steps

## Motivation
Currently, dependent map steps have `initial_tasks = 1` as a placeholder until their dependencies complete. This is semantically incorrect and confusing:
- `1` implies "will spawn exactly 1 task" but that's false
- `NULL` correctly means "unknown until dependencies complete"
- Reduces cognitive load - see NULL, know it's unknown

## Critical Considerations
Before implementing, these issues must be addressed:

### 1. ~~The "Last Dependency" Problem~~ RESOLVED
**Map steps can have at most 1 dependency** (enforced in add_step.sql:24):
```sql
-- This constraint simplifies everything:
IF step_type = 'map' AND array_length(deps_slugs, 1) > 1 THEN
  RAISE EXCEPTION 'Map step can have at most one dependency'
```
This means we always know exactly when to resolve `initial_tasks` - when the single dependency completes!

### 2. Non-Array Output Handling
What if a dependency doesn't produce an array?
```sql
-- Must handle both cases:
CASE
  WHEN jsonb_typeof(output) = 'array' THEN jsonb_array_length(output)
  ELSE 1  -- Treat non-array as single item to map
END
```

### 3. ~~Race Condition Prevention~~ RESOLVED
Since map steps have at most 1 dependency, no race conditions possible!
The single dependency completes once, updates initial_tasks atomically.

### 4. The Start Ready Steps Problem
**CRITICAL**: We cannot use COALESCE - steps must NOT start with NULL initial_tasks
```sql
-- WRONG: COALESCE(initial_tasks, 1)
-- RIGHT: Add assertion before starting
IF started_step.initial_tasks IS NULL THEN
  RAISE EXCEPTION 'Cannot start step % with unknown initial_tasks', step_slug;
END IF;
```

## Implementation Plan

### 1. Schema Change
```sql
-- In 0060_tables_runtime.sql
ALTER TABLE pgflow.step_states
ALTER COLUMN initial_tasks DROP NOT NULL,
ALTER COLUMN initial_tasks DROP DEFAULT;

-- Update constraint
ALTER TABLE pgflow.step_states
DROP CONSTRAINT step_states_initial_tasks_check,
ADD CONSTRAINT step_states_initial_tasks_check
  CHECK (initial_tasks IS NULL OR initial_tasks >= 0);
```

### 2. Update start_flow Function
```sql
-- In 0100_function_start_flow.sql
-- Change initial_tasks assignment logic:
CASE
  WHEN fs.step_type = 'map' AND fs.deps_count = 0 THEN
    -- Root map: get array length from input
    CASE
      WHEN jsonb_typeof(start_flow.input) = 'array' THEN
        jsonb_array_length(start_flow.input)
      ELSE
        1
    END
  WHEN fs.step_type = 'map' AND fs.deps_count > 0 THEN
    -- Dependent map: unknown until dependencies complete
    NULL
  ELSE
    -- Single steps: always 1 task
    1
END
```

### 3. Update start_ready_steps Function
```sql
-- In 0100_function_start_ready_steps.sql

-- Empty map detection remains unchanged:
AND step_state.initial_tasks = 0  -- NULL != 0, so NULL maps won't match

-- Add NULL check BEFORE starting steps:
ready_steps AS (
  SELECT *
  FROM pgflow.step_states
  WHERE remaining_deps = 0
    AND status = 'created'
    AND initial_tasks IS NOT NULL  -- NEW: Cannot start with unknown count
)

-- Task generation stays the same (no COALESCE needed):
CROSS JOIN LATERAL generate_series(0, started_step.initial_tasks - 1)
```

### 4. Update complete_task Function
```sql
-- In 0100_function_complete_task.sql

-- Simplified: map steps have exactly 1 dependency
initial_tasks = CASE
  WHEN s.step_type = 'map' AND ss.initial_tasks IS NULL THEN
    -- Resolve NULL to actual value based on output
    CASE
      WHEN jsonb_typeof(complete_task.output) = 'array'
      THEN jsonb_array_length(complete_task.output)
      ELSE 1  -- Non-array treated as single item
    END
  ELSE ss.initial_tasks  -- Keep existing value
END

-- Note: This already works for single->map!
-- Just need to extend for map->map when we aggregate outputs
```

### 5. Update cascade_complete_taskless_steps Function
```sql
-- In 0100_function_cascade_complete_taskless_steps.sql

-- Update the initial_tasks setting for cascade:
initial_tasks = CASE
  WHEN s.step_type = 'map' AND dep_count.has_zero_tasks
  THEN 0  -- Empty array propagation
  ELSE ss.initial_tasks  -- Keep NULL as NULL
END

-- The BOOL_OR(c.initial_tasks = 0) already handles NULL correctly
-- (NULL = 0 returns false, which is what we want)
```

### 6. Add Safety Assertions
```sql
-- Add check constraint or trigger to ensure:
-- When status changes from 'created' to 'started',
-- initial_tasks must NOT be NULL

ALTER TABLE pgflow.step_states
ADD CONSTRAINT initial_tasks_known_when_started
  CHECK (
    status != 'started'
    OR initial_tasks IS NOT NULL
  );
```

### 7. Update Tests
- Update test expectations to check for NULL instead of 1
- Add specific tests for NULL -> actual value transitions
- Test that steps can't start with NULL initial_tasks

### 8. Migration Strategy
```sql
-- Create migration to update existing data:
UPDATE pgflow.step_states
SET initial_tasks = NULL
WHERE step_slug IN (
  SELECT s.step_slug
  FROM pgflow.steps s
  WHERE s.step_type = 'map'
    AND EXISTS (
      SELECT 1 FROM pgflow.deps d
      WHERE d.flow_slug = s.flow_slug
        AND d.step_slug = s.step_slug
    )
)
AND status = 'created';
```

## Benefits
1. **Semantic correctness**: NULL = unknown, not "1 task" placeholder
2. **Clearer mental model**: No translation needed when reading state
3. **Easier debugging**: Can immediately see which values are unresolved
4. **Type safety**: TypeScript `number | null` enforces proper handling
5. **Simpler than expected**: Map steps having max 1 dependency eliminates complexity

## Simplified Implementation Path
Since map steps can only have 0 or 1 dependency:
1. Root maps (0 deps): Get initial_tasks from flow input immediately
2. Dependent maps (1 dep): Start with NULL, resolve when dependency completes
3. No multi-dependency complexity or race conditions!

## Testing Checklist
- [ ] Root map steps get correct initial_tasks from input array
- [ ] Dependent map steps start with NULL initial_tasks
- [ ] Single -> Map updates NULL to array length
- [ ] Map -> Map updates NULL to aggregated array length (future)
- [ ] Empty array propagation sets 0, not NULL
- [ ] Steps cannot start with NULL initial_tasks
- [ ] All arithmetic operations handle NULL safely