# start_tasks Function Changes for Fanout

## Overview

The `start_tasks` function needs modification to handle fanout steps differently from single steps when constructing task inputs.

## Current Behavior

All tasks receive:
```json
{
  "run": { /* original run input */ },
  "dep1": { /* dependency output */ },
  "dep2": { /* dependency output */ }
}
```

## Required Changes

### Join with Steps Table
Add step information to determine step_type:
```sql
join pgflow.steps step on step.flow_slug = st.flow_slug and step.step_slug = st.step_slug
```

### Conditional Input Construction

**Single Steps (current behavior):**
```sql
jsonb_build_object('run', r.input) || coalesce(dep_out.deps_output, '{}'::jsonb)
```

**Fanout Steps (new behavior):**
```sql
-- Extract array[task_index] from the single dependency output
(select value->st.task_index from jsonb_each(dep_out.deps_output) limit 1)
```

### Complete Input Logic
```sql
case 
  when step.step_type = 'single' then 
    jsonb_build_object('run', r.input) || coalesce(dep_out.deps_output, '{}'::jsonb)
  when step.step_type = 'fanout' then
    (select value->st.task_index from jsonb_each(dep_out.deps_output) limit 1)
end as input
```

## Data Flow Example

### Preprocessing Ghost Step
```typescript
// Ghost step receives full context and original dependencies
array: ({ users }, context) => 
  users.map(user => ({ 
    user, 
    runId: context.run.id,     // Include run data if needed
    config: context.run.config 
  }))

// Ghost step output: [
//   { user: {...}, runId: "123", config: {...} },
//   { user: {...}, runId: "123", config: {...} }
// ]
```

### Fanout Task Input
```javascript
// Task with task_index = 0 receives:
{
  user: {...},
  runId: "123", 
  config: {...}
}

// Task with task_index = 1 receives:
{
  user: {...},
  runId: "123",
  config: {...}  
}
```

### Fanout Handler
```typescript
// Handler receives just the array element, no 'run' wrapper
(item) => {
  // item = { user: {...}, runId: "...", config: {...} }
  return processUser(item.user, item.config)
}
```

## Key Principles

1. **Single steps**: Get full context including run input and all dependencies
2. **Fanout steps**: Get only the individual array element at task_index
3. **No run wrapper for fanout**: Forces explicit data preparation in preprocessing
4. **Clean separation**: Preprocessing handles context, fanout handles individual items

## Benefits

- **Clear responsibility**: Ghost step prepares all needed data
- **Clean handlers**: Fanout handlers work with individual items only  
- **Explicit data flow**: Any run context must be deliberately included in array
- **Type safety**: Handler receives exactly the array element type