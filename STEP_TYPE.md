# Step Types in pgflow

## Definition

**step_type = "Task Spawning Strategy + Output Validation + Result Aggregation"**

step_type defines the complete execution lifecycle for a step, determining how work is distributed, validated, and combined regardless of whether the step was user-defined or DSL-generated.

## Core Responsibilities

### 1. Task Spawning Strategy
- **Task Count**: How many tasks to create when step becomes ready
- **Task Indexing**: Assignment of task_index values (0 for single, 0..N-1 for fanout)
- **Queue Management**: Message generation and dispatch to worker queue

### 2. Output Validation
- **Validation Rules**: What constraints to apply when tasks complete
- **Error Handling**: How to handle invalid outputs (fail, skip, etc.)
- **Failure Attribution**: Which step receives error status and why

### 3. Result Aggregation  
- **Combination Logic**: How to merge multiple task outputs into step output
- **Ordering Requirements**: Whether task execution order matters
- **Completion Criteria**: When step is considered complete

## Step Type Implementations

| step_type | Task Spawning | Output Validation | Result Aggregation | Use Case |
|-----------|---------------|-------------------|-------------------|----------|
| `single` | 1 task<br/>(task_index = 0) | None<br/>(Accept any JSON) | Step output = Task output | Regular user steps |
| `array` | 1 task<br/>(task_index = 0) | Must be JSON array<br/>Handle empty_array_mode | Step output = Validated array | Array generation for map |
| `bool` | 1 task<br/>(task_index = 0) | Must be boolean | Step output = Boolean value | Condition checks, approvals |
| `map` | N tasks<br/>(task_index = 0..N-1) | None<br/>(Trust dependency) | Step output = [task₀, task₁, ..., taskₙ₋₁] | Parallel processing |
| `gate` | No tasks<br/>(taskless) | N/A | N/A | Local skip control |
| `branch_gate` | No tasks<br/>(taskless) | N/A | N/A | Cascade skip control |

## Detailed Behaviors

### `single` Steps
```sql
-- Spawning: Generate exactly one task
generate_series(0, 0) → [0]

-- Validation: No constraints
-- Any JSON output accepted

-- Aggregation: Direct passthrough  
step.output = task[0].output
```

### `array` Steps  
```sql
-- Spawning: Generate exactly one task
generate_series(0, 0) → [0]

-- Validation: Array constraints
CASE 
  WHEN jsonb_typeof(output) != 'array' THEN fail_step()
  WHEN array_length = 0 AND empty_array_mode = 'fail' THEN fail_step()
  WHEN array_length = 0 AND empty_array_mode = 'skip' THEN skip_step()
  ELSE accept_output()
END

-- Aggregation: Validated array passthrough
step.output = validated_array
```

### `bool` Steps
```sql
-- Spawning: Generate exactly one task
generate_series(0, 0) → [0]

-- Validation: Boolean constraints
CASE 
  WHEN jsonb_typeof(output) != 'boolean' THEN 
    fail_step() WITH error_message = 'condition_error'
  ELSE 
    accept_output()
    -- Dependent steps check this boolean for skip logic
END

-- Aggregation: Direct passthrough
step.output = boolean_value
```

### `map` Steps
```sql
-- Spawning: Generate N tasks based on dependency array
generate_series(0, remaining_tasks - 1) → [0, 1, 2, ..., N-1]

-- Validation: None (trust array dependency)
-- Dependency already validated array

-- Aggregation: Ordered by task_index
step.output = array_agg(task.output ORDER BY task_index)
```

## Key Design Principles

### 1. Behavior-Focused
step_type describes **what the step does**, not **who created it**. DSL-generated steps use the same types as user-defined steps if they have the same behavior.

### 2. Execution Lifecycle Ownership
Each step_type owns its complete execution pattern - from task creation through result aggregation. No shared logic between types.

### 3. Composability  
step_types can be chained together (bool → array → map) to create complex processing patterns while maintaining clear separation of concerns.

### 4. SQL Core Simplicity
The SQL core only needs to understand these four patterns. All complexity is contained within each type's well-defined behavior.

## Implementation Notes

- **Task counting**: `remaining_tasks` value determines map task count
- **Empty map**: `remaining_tasks = 0` creates no tasks, handled by completion logic
- **Validation timing**: Happens in `complete_task` when task outputs are available
- **Error propagation**: Validation failures prevent dependent steps from starting
- **Bool validation**: Bool steps validate output is true/false, dependent steps use the boolean value

## DSL Ghost Step Generation

### Dependency Chain Ordering

When DSL options generate ghost steps, they must be ordered correctly:

1. **Bool steps come first** (skip conditions)
2. **Array steps come second** (data preparation)
3. **Original step comes last** (actual processing)

### Example: Map with Both skipIf and array Functions

```typescript
.map({
  slug: 'process_items',
  skipIf: ({ config }) => !config.enabled,  // Creates gen_bool_process_items
  array: ({ data }) => data.items,          // Creates gen_array_process_items
  skipMode: 'optional'
}, handler)
```

Generates dependency chain:
```
gen_bool_process_items → gen_array_process_items → process_items
```

### DSL Patterns

| Option | Type | Ghost Step | Purpose |
|--------|------|------------|----------|
| `array: function` | Function | `gen_array_*` | Generate array for map |
| `array: 'slug'` | String | None | Reference existing array step |
| `skipIf: function` | Function | `gen_bool_*` | Evaluate boolean condition |
| `skipIf: 'slug'` | String | None | Reference existing bool step |

### Human Decision Points

Bool steps with `queue: false` enable human approvals:

```typescript
// Manager approval required
.bool({
  slug: 'manager_approval',
  queue: false  // No handler - waits for human decision
})

// Dependent step uses approval boolean
.step({
  slug: 'execute_refund',
  dependsOn: ['manager_approval']
}, ({ manager_approval }) => {
  if (manager_approval) {
    return processRefund()
  }
  // Handle non-approval case
})
```

## Future Extensions

New step_types can be added by implementing the three core responsibilities:
- `batch`: Spawn tasks in configurable batch sizes
- `number`: Validate numeric output with constraints
- `retry`: Custom retry patterns with exponential backoff

Each new type follows the same pattern: define spawning, validation, and aggregation behavior.