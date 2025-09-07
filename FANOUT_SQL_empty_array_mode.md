# Empty Array Mode Configuration

## Overview

Controls how fanout steps behave when their gen_array dependency returns an empty array.

## Schema Addition
```sql
ALTER TABLE pgflow.steps
ADD COLUMN empty_array_mode text DEFAULT 'fail' 
CHECK (empty_array_mode IN ('fail', 'skip', 'complete'));
```

## Behavior Modes

### `fail` (default)
- Step status: `failed`  
- Failure reason: `preprocessing_error`
- Error message: "gen_array returned empty array"
- **Use case**: Empty arrays are considered errors

### `complete` 
- Step status: `completed`
- Output: `[]` (empty array)
- **Use case**: Empty arrays are valid, produce empty results

### `skip`
- Step status: `skipped` 
- Skip reason: `empty_array`
- **Use case**: Empty arrays mean "nothing to do", skip downstream

## Implementation Points

- **Location**: Handled in `complete_task` when gen_array step completes
- **Scope**: gen_array step validates its own output and handles edge cases
- **fanout Isolation**: fanout steps never see invalid arrays - gen_array handles validation
- **Skip Propagation**: If gen_array fails/skips, fanout step never starts (dependency not satisfied)

## DSL Integration

```typescript
.fanout({
  slug: 'process_users',
  empty_array_mode: 'complete'  // Allow empty arrays
}, (user) => processUser(user))
```

## Benefits

1. **Explicit control**: User decides empty array semantics
2. **Error prevention**: Default 'fail' catches unexpected empty arrays  
3. **Skip integration**: Works with conditional skip patterns
4. **Flexible workflows**: Supports different business logic requirements