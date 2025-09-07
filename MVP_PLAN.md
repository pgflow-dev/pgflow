# pgflow MVP Implementation Plan

## Executive Summary

This plan outlines the minimum viable implementation for pgflow's parallel processing capabilities. The MVP focuses on delivering immediate value through explicit array generation and map-based parallel execution while ensuring future extensibility for planned features like branching, conditions, and skip logic.

**MVP Philosophy**: Build the simplest implementation that works without locking out future complexity. Every decision prioritizes immediate functionality while maintaining architectural flexibility.

## MVP Scope

### Features to Implement

1. **`.array()` DSL method** - Explicit array creation with type safety (sugar over `.step()`)
2. **`.map()` step type** - Parallel processing of array elements  
3. **`queue` routing** - Direct task assignment to specific worker queues
4. **No ghost steps** - All steps are explicitly user-defined (no DSL-generated intermediates)
5. **No validation logic** - Validation deferred to worker-side Zod integration

### Features NOT in MVP

- ❌ Array output validation (deferred to Zod schemas)
- ❌ Empty array handling modes
- ❌ Database-side validation logic
- ❌ `step_type='array'` (`.array()` uses `step_type='single'`)
- ❌ Gate-based skip conditions
- ❌ Bool step type
- ❌ Branch preprocessing
- ❌ Implicit array generation in `.map()`

## Implementation Order

### Phase 1: Database Schema Updates

Enable new step types and queue routing at the schema level.

### Phase 2: SQL Function Updates

Modify core orchestration functions to handle array/map behaviors.

### Phase 3: DSL Extensions

Add `.array()` and `.map()` methods with proper TypeScript typing.

## Detailed Implementation

### 1. Array DSL Method

**Purpose**: Provide type-safe array creation with semantic clarity (sugar over `.step()`).

#### Implementation Details
- **Execution**: Same as `.step()` - spawns 1 task, uses `step_type='single'`
- **Type Safety**: TypeScript enforces handler must return `Array<T>`
- **Database**: No special handling - treated as regular step
- **Validation**: Deferred to future Zod integration

#### DSL Usage
```typescript
.array({ 
  slug: 'survey_items',
  dependsOn: ['users', 'questions']
}, ({ run, users, questions }) => {
  // TypeScript enforces array return type
  return users.map(user => ({
    user_id: user.id,
    questions: questions.filter(q => q.target === user.role)
  }));
})
```

### 2. Map Step Type

**Purpose**: Spawn parallel tasks to process each element of an array dependency.

#### Behavior Contract
- **Task Spawning**: Spawns N tasks (task_index = 0..N-1) based on array dependency length
- **Input**: Each task receives `array[task_index]` (individual element)
- **Empty Array**: Auto-completes with `[]` when array is empty (0 tasks)
- **Result Aggregation**: `[task₀_output, task₁_output, ..., taskₙ₋₁_output]` ordered by task_index

#### DSL Usage
```typescript
.map({
  slug: 'send_surveys', 
  array: 'survey_items',  // Must reference existing array step
  queue: 'email_worker'   // Optional, route to specific worker
}, ({ user_id, questions }) => {
  // Handler receives individual array elements
  return sendSurveyEmail(user_id, questions);
})
```

#### Task Spawning Logic
```sql
-- In start_ready_steps function
generate_series(0, remaining_tasks - 1) AS task_index

-- Special handling for empty arrays
IF remaining_tasks = 0 THEN
  UPDATE step_states SET status = 'completed', output = '[]'::jsonb
END IF
```

#### Input Construction
```sql
-- In start_tasks function
CASE 
  WHEN step_type = 'map' THEN
    -- Extract element at task_index from array dependency
    (SELECT value->task.task_index 
     FROM jsonb_each(deps_output) 
     LIMIT 1)
  ELSE
    -- Standard input for single/array steps
    jsonb_build_object('run', run.input) || deps_output
END
```

### 3. Queue-Based Task Routing

**Purpose**: Route tasks to specific worker queues for specialized processing.

#### Configuration Options
- `queue: 'worker_name'` - Route to specific queue
- `queue: false` - Manual completion (no worker task)
- `queue: undefined` - Default to flow_slug (backward compatible)

#### Schema Changes
```sql
-- Add to steps table
ALTER TABLE pgflow.steps ADD COLUMN queue TEXT;

-- Add to step_tasks table with inheritance
ALTER TABLE pgflow.step_tasks ADD COLUMN queue TEXT;

-- Unique constraint for message_id per queue
ALTER TABLE pgflow.step_tasks 
  ADD CONSTRAINT unique_msg_per_queue 
  UNIQUE (queue, message_id) 
  WHERE message_id IS NOT NULL;
```

#### Worker Polling
```typescript
// Worker specifies which queues to poll
const worker = new PgflowWorker({ 
  queues: ['email_worker', 'sms_worker'] 
});

// Poll queues and process tasks
const tasks = await worker.poll();  // Polls all configured queues
```

## Database Migrations

### Migration 1: Enable Map Step Type
```sql
-- Update step_type constraint to add 'map'
ALTER TABLE pgflow.steps 
  DROP CONSTRAINT steps_step_type_check;
  
ALTER TABLE pgflow.steps 
  ADD CONSTRAINT steps_step_type_check 
  CHECK (step_type IN ('single', 'map'));
```

### Migration 2: Add Task Counting Columns
```sql
-- Add to step_states for tracking map progress
ALTER TABLE pgflow.step_states 
  ADD COLUMN initial_tasks INT NOT NULL DEFAULT 1 CHECK (initial_tasks >= 0),
  ADD COLUMN total_tasks INT NOT NULL DEFAULT 1 CHECK (total_tasks >= 0);
  -- Note: remaining_tasks already exists in the schema

-- Integrity constraints (complete set of invariants)
ALTER TABLE pgflow.step_states
  ADD CONSTRAINT total_tasks_gte_initial CHECK (total_tasks >= initial_tasks),
  ADD CONSTRAINT total_tasks_gte_remaining CHECK (total_tasks >= remaining_tasks),
  ADD CONSTRAINT initial_tasks_gte_zero CHECK (initial_tasks >= 0),
  ADD CONSTRAINT remaining_tasks_gte_zero CHECK (remaining_tasks >= 0);

-- Semantics:
-- initial_tasks: Original task count from array (never changes, audit trail)
-- total_tasks: Total task count (for MVP, always equals initial_tasks)
-- remaining_tasks: Tasks not yet completed (decrements as tasks complete)
-- Invariants: total_tasks >= initial_tasks >= 0, total_tasks >= remaining_tasks >= 0
-- Note: Task appending not supported in MVP, but schema supports it for future
```

### Migration 3: Enable Queue Routing
```sql
-- Add queue columns
ALTER TABLE pgflow.steps ADD COLUMN queue TEXT;
ALTER TABLE pgflow.step_tasks ADD COLUMN queue TEXT;

-- Queue uniqueness constraint
ALTER TABLE pgflow.step_tasks 
  ADD CONSTRAINT unique_msg_per_queue 
  UNIQUE (queue, message_id) 
  WHERE message_id IS NOT NULL;

-- Performance index
CREATE INDEX idx_step_tasks_queue_status 
  ON pgflow.step_tasks (queue, status) 
  WHERE queue IS NOT NULL AND status = 'queued';
```

### Migration 4: Remove Single Task Constraint
```sql
-- Allow multiple tasks per step for map
ALTER TABLE pgflow.step_tasks 
  DROP CONSTRAINT only_single_task_per_step;
```

## SQL Function Updates

### Update `add_step` Function
```sql
-- Add step_type and queue parameters
CREATE OR REPLACE FUNCTION pgflow.add_step(
  flow_slug TEXT,
  step_slug TEXT,
  step_type TEXT DEFAULT 'single',  -- New
  deps_slugs TEXT[] DEFAULT '{}',
  queue TEXT DEFAULT NULL,          -- New
  -- ... other options
)
```

### Update `start_ready_steps` Function
Key changes:
1. Dynamic task generation using `generate_series(0, remaining_tasks - 1)`
2. Auto-completion for zero-task steps
3. Queue-aware message sending
4. Task status based on queue presence

### Update `complete_task` Function
Key additions:
1. Map dependent task count calculation using `initial_tasks`, `total_tasks`, `remaining_tasks`
2. Set task counters when steps complete and have map dependents
3. Result aggregation for map steps
4. Auto-completion for empty array cases (remaining_tasks = 0)

### Update `start_tasks` Function
Changes:
1. Accept `queue_name` instead of `flow_slug`
2. Map-aware input construction
3. Queue-based task filtering

## DSL Implementation

### TypeScript Method Signatures

```typescript
// .array() method (sugar over .step())
array<Slug extends string, THandler extends (...args: any[]) => Array<Json>>(
  opts: StepOptions<Slug>,
  handler: THandler
): Flow<..., Steps & { [K in Slug]: AwaitedReturn<THandler> }, ...> {
  // Under the hood: this.step(opts, handler)
  // TypeScript enforces THandler returns Array<T>
}

// .map() method (real new step type)
map<Slug extends string, ArraySlug extends keyof Steps, THandler extends MapHandler>(
  opts: MapStepOptions<Slug, ArraySlug>,
  handler: THandler
): Flow<..., Steps & { [K in Slug]: Array<AwaitedReturn<THandler>> }, ...>
```

### Type Safety Features
- `.array()` enforces `Array<T>` return type at compile time
- Map handler input inferred from array element type  
- Map output always `Array<HandlerReturnType>`
- Automatic dependency chain for map on array step

## Testing Strategy

### Unit Tests
1. `.array()` DSL method (type enforcement, sugar over `.step()`)
2. Map task spawning (N tasks, zero tasks, task indexing)
3. Queue routing (default, specific, manual)
4. Input construction (array elements for map tasks)

### Integration Tests
1. End-to-end array → map flow
2. Empty array auto-completion (0 tasks)
3. Queue-based worker routing
4. Task counting and progress tracking

### Performance Tests
1. Large array fanout (1000+ elements)
2. Queue contention with multiple workers
3. Concurrent map task completion and aggregation

## Success Criteria

The MVP is successful when:
1. ✅ Users can create type-safe array steps with `.array()` method
2. ✅ Map steps spawn parallel tasks for array elements
3. ✅ Tasks route to appropriate worker queues  
4. ✅ Empty arrays auto-complete gracefully (0 tasks)
5. ✅ All existing flows continue working unchanged

## Future Extensibility

This MVP foundation enables future features without architectural changes:

### Near-term Extensions
- **Zod schema validation**: Worker-side output validation with rich errors
- **Array item schemas**: `.array({ itemSchema: z.object({...}) })`
- **Input schema inference**: `new Flow({ inputSchema: z.object({...}) })`

### Long-term Extensions  
- **Bool step type**: For decision-making workflows
- **Gate-based skipping**: Build on step_type system
- **Branch preprocessing**: Ghost step generation patterns
- **Advanced validation**: Schema composition, transforms, conditional schemas

The key architectural decisions:
1. **Worker-side validation**: Maintains clean layer separation
2. **Type-first approach**: TypeScript drives, schemas validate
3. **Additive complexity**: Simple flows stay simple, complex flows get power tools

## Risk Mitigation

### Identified Risks
1. **Performance**: Large fanouts could overwhelm database
   - *Mitigation*: Implement batching and rate limiting
   
2. **Debugging**: Multiple parallel tasks harder to trace
   - *Mitigation*: Enhanced logging and task correlation
   
3. **Type Safety**: Complex type inference for nested arrays
   - *Mitigation*: Explicit typing with clear boundaries

### Rollback Strategy
All changes are additive with defaults maintaining current behavior:
- Existing flows unaffected (default step_type='single')
- Queue defaults to flow_slug (current routing)
- Schema changes are backward compatible

## Implementation Timeline

**Week 1**: Schema migrations and SQL function updates
**Week 2**: DSL implementation with type safety
**Week 3**: Worker queue routing updates  
**Week 4**: Testing and documentation

## Conclusion

This MVP delivers immediate value through parallel processing capabilities while maintaining pgflow's core philosophy of simplicity and PostgreSQL-native execution. The explicit approach ensures users understand the execution model while preserving flexibility for future enhancements.

The implementation avoids premature optimization and complex abstractions, focusing on robust primitives that compose naturally into more sophisticated patterns as needs evolve.