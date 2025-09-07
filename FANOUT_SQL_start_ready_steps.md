# start_ready_steps Changes for Map Support

## Core Changes

### Task Spawning Logic
```sql
-- Generate tasks based on remaining_tasks count
CROSS JOIN LATERAL generate_series(0, remaining_tasks - 1) AS task_gen(task_index)

-- For fanout steps with empty arrays: generate_series(0, -1) = empty set
-- Result: No tasks created, no messages sent
```

### Zero Task Handling
```sql
-- Auto-complete steps that have no tasks to spawn
UPDATE pgflow.step_states
SET 
  status = 'completed',
  completed_at = now(),
  output = '[]'::jsonb
WHERE status = 'started' 
  AND remaining_tasks = 0
```

## map Step Simplification

map steps receive **guaranteed valid arrays** from array dependencies:

- **No validation needed**: array step already handled array validation  
- **No empty array handling**: array step failed/skipped if array was invalid
- **Pure task spawning**: Just spawn 0, 1, or N tasks based on remaining_tasks count

```sql  
-- map steps trust their dependencies
generate_series(0, remaining_tasks - 1)  -- Works for any N >= 0
```

## Uniform Step Type Handling

All step types use same task generation pattern:
- **single/array**: remaining_tasks=1 → generate_series(0,0) = [0]
- **map**: remaining_tasks=N → generate_series(0,N-1) = [0,1,2...N-1]
- **empty map**: remaining_tasks=0 → generate_series(0,-1) = [] (handled specially)

## Benefits

1. **Uniform logic**: All step types use same task generation mechanism
2. **Zero task support**: Handles empty arrays gracefully
3. **Configurable behavior**: Respects empty_array_mode settings
4. **No special cases**: Single pattern for 1, N, or 0 tasks