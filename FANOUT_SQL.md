# Map SQL Implementation

## Overview

Map steps enable spawning multiple tasks from a single step, with each task processing individual array elements. The architecture separates concerns between SQL (generic task spawning) and DSL (array creation logic).

## Architecture

**SQL Layer (Generic Task Spawning):**
- Map steps spawn N tasks where N = array.length
- Each task gets array[task_index] as input
- Results aggregated back into ordered array based on task_index
- No knowledge of how the array was created

**DSL Layer (Flexible Array Creation):**
- Ghost steps (`gen_array_*`) run user's `array` function
- Transform original dependencies into spawnable array
- Full JavaScript flexibility for preprocessing logic

## Schema Changes Required

### Step Types
```sql
-- Add array and map to step_type enum
check (step_type in ('single', 'array', 'map'))
```

### Task Constraints
```sql
-- Replace single task constraint with step-type aware constraint
constraint single_step_single_task check (
  step_type = 'map' or task_index = 0
)
```

### Step States
```sql
-- remaining_tasks dynamically set based on array length for map steps
-- Default 1 for single steps, N for map steps
```

## SQL Function Changes

### start_ready_steps
- Detect map steps by step_type
- Read array from dependency output
- Create N tasks with task_index 0, 1, 2, ...N-1
- Set step_states.remaining_tasks = N

### start_tasks
- For map tasks, pass array[task_index] instead of full array
- Individual tasks get single array element, not entire array

### complete_task
- When all map tasks complete, aggregate outputs as [task0.output, task1.output, ...]
- Maintain order based on task_index

## DSL Usage Patterns

### Basic Array Processing
```typescript
.map({
  slug: 'process_users',
  dependsOn: ['users'],
  array: ({ users }) => users
}, (user) => processUser(user))
```

### Cross-Product Spawning
```typescript
.map({
  slug: 'send_notifications',
  dependsOn: ['users', 'templates'],
  array: ({ users, templates }) => 
    users.flatMap(u => templates.map(t => ({ user: u, template: t })))
}, ({ user, template }) => sendNotification(user, template))
```

### Conditional Spawning
```typescript
.map({
  slug: 'process_active_users',
  dependsOn: ['users'],
  array: ({ users }) => users.filter(u => u.active)
}, (user) => processActiveUser(user))
```

### Batching
```typescript
.map({
  slug: 'process_batches',
  dependsOn: ['data'],
  array: ({ data }) => chunk(data, 100)
}, (batch) => processBatch(batch))
```

## Implementation Benefits

1. **SQL Core Stays Simple**: Only understands single vs multiple tasks
2. **DSL Provides Flexibility**: Any JavaScript logic for array creation
3. **Future Extensions**: New patterns require only DSL changes
4. **Type Safety**: Array<T> inference where T is task handler return type

## Error Handling

- **Ghost step fails**: Map step fails immediately, no tasks spawned
- **Individual tasks fail**: Standard retry logic per task
- **Mixed results**: Step fails if any task ultimately fails after max_attempts

## Validation

- **Runtime**: Ghost step output must be actual array
- **Empty arrays**: Step completes immediately with empty array output
- **Size limits**: Consider max tasks per step (e.g., 1000) for performance