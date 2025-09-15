# PLAN: Cascade Complete Taskless Steps

## Problem Statement

Steps with `initial_tasks = 0` need immediate completion without task execution. When such a step completes, its dependents may become ready - and if those dependents are also taskless, they should complete immediately as well, creating a cascade effect.

Currently, this cascade doesn't happen, leaving taskless steps in a "ready but not completed" state.

## Current State

`start_ready_steps` currently contains logic to complete empty map steps (taskless), but:
- It only handles the immediate step, not cascading to dependents
- This logic is mixed with task spawning concerns
- It can't handle chains of taskless steps

This plan extracts that logic into a dedicated function and adds cascade capability.

## Taskless Step Types

### Current
- **Empty array maps**: Map steps receiving `[]` input

### Future (generic design)
- **Condition gates**: Evaluate JSONP conditions, route without execution
- **Validators**: Check constraints, pass/fail instantly  
- **Aggregators**: Might receive 0 inputs to aggregate
- **Routers**: Direct flow based on input, no processing needed

The solution must be **generic** - not checking `step_type` but relying on `initial_tasks = 0`.

## Edge Cases & Patterns

### Chain cascade
```
A (taskless) → B (taskless) → C (taskless) → D (normal)
```
All taskless steps complete instantly, then D starts.

### Fan-in pattern
```
A (normal) ⟋
            → C (taskless) → D (normal)
B (normal) ⟌
```
C completes only when BOTH A and B complete.

### Mixed cascade
```
A (normal) → B (taskless) → C (taskless) → D (normal) → E (taskless)
```
- B,C cascade when A completes
- E completes instantly when D completes
- Two separate cascade events

### Entire flow taskless
```
Validate → Route → Log
```
Entire flow completes synchronously in `start_flow` call.

## Proposed Solution

### Performance Analysis - Corrected

Initial analysis was **incorrect**. After code review, the actual situation:

1. **complete_task** calls **start_ready_steps** on EVERY task completion
   - For 10k tasks = 10,000 calls to start_ready_steps
   
2. **BUT** dependent steps' `remaining_deps` only decrements when STEP completes
   - Happens ONCE when all tasks done, not 10,000 times
   
3. **Cascade would check 10k times but find nothing 9,999 times**
   - Tasks 1-9,999: cascade checks, finds no ready taskless steps
   - Task 10,000: cascade finds chain ready, runs 50 iterations ONCE

**Real impact**: 10,000 wasted checks + 50 iterations = **10,050 operations** (not 500,000!)

### Call Site Heat Analysis

| Call Site | Heat Level | When Cascade Needed | Actual Frequency |
|-----------|------------|---------------------|------------------|
| **start_flow()** | 🧊 COLD | Always check | Once per workflow |
| **complete_task()** | 🔥🔥🔥 HOT | Only when step completes | Once per step (not task!) |
| **start_ready_steps()** | 🔥 HOT | Never - wrong place | N/A |

### PRIMARY SOLUTION: Simple Conditional Cascade

Only call cascade when a step actually completes:

```sql
-- In complete_task, after line 91
IF v_step_state.status = 'completed' THEN
  -- Step just completed, cascade any ready taskless steps
  PERFORM cascade_complete_taskless_steps(run_id);
  
  -- Send broadcast event (existing code)
  PERFORM realtime.send(...);
END IF;

-- Remove cascade from start_ready_steps entirely
```

This reduces cascade calls from 10,000 (every task) to 1 (when step completes)!

### The Cascade Function

Use a simple loop that completes all ready taskless steps with safety measures:

```sql
CREATE OR REPLACE FUNCTION pgflow.cascade_complete_taskless_steps(run_id uuid)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_completed int := 0;
  v_iteration_completed int;
  v_iterations int := 0;
  v_max_iterations int := 50;  -- Safety limit matching worst-case analysis
BEGIN
  LOOP
    -- Safety counter to prevent infinite loops
    v_iterations := v_iterations + 1;
    IF v_iterations > v_max_iterations THEN
      RAISE EXCEPTION 'Cascade loop exceeded safety limit of % iterations', v_max_iterations;
    END IF;

    WITH completed AS (
      UPDATE pgflow.step_states
      SET status = 'completed',
          started_at = now(),
          completed_at = now(),
          remaining_tasks = 0
      WHERE step_states.run_id = cascade_complete_taskless_steps.run_id
        AND status = 'created'
        AND remaining_deps = 0
        AND initial_tasks = 0
      RETURNING *
    ),
    dep_updates AS (
      UPDATE pgflow.step_states ss
      SET remaining_deps = ss.remaining_deps - 1
      FROM completed c
      JOIN pgflow.deps d ON d.flow_slug = c.flow_slug
                         AND d.dep_slug = c.step_slug
      WHERE ss.run_id = c.run_id
        AND ss.step_slug = d.step_slug
    ),
    -- Send realtime events and update run count...
    SELECT COUNT(*) INTO v_iteration_completed FROM completed;

    EXIT WHEN v_iteration_completed = 0;
    v_total_completed := v_total_completed + v_iteration_completed;
  END LOOP;

  RETURN v_total_completed;
END;
$$;
```

**Performance**: 50 iterations once per step completion is acceptable
**Safety**: Hard iteration limit prevents infinite loops from logic errors

### Integration Points

```sql
-- In start_flow (COLD PATH)
PERFORM cascade_complete_taskless_steps(run_id);
PERFORM start_ready_steps(run_id);

-- In complete_task (HOT PATH - but only when step completes)  
IF step_completed THEN
  PERFORM cascade_complete_taskless_steps(run_id);
END IF;

-- NOT in start_ready_steps - that was the wrong place
```

### Why Other Approaches Fail

#### Recursive CTE: PostgreSQL Limitations
- ❌ Cannot use subqueries referencing recursive CTE
- ❌ Cannot use NOT EXISTS with recursive reference
- ❌ Cannot use aggregates on recursive reference
- ❌ Cannot check "all dependencies satisfied" condition

#### One-Wave Approach: Weird Coupling
- ❌ Creates strange dependencies between unrelated steps
- ❌ Filter2 would complete when some UNRELATED step's task completes
- ❌ Confusing semantics and hard to debug

#### Calling from start_ready_steps: Wrong Layer
- ❌ Would check for cascade on EVERY task (10,000 times)
- ❌ 9,999 wasted checks finding nothing
- ❌ Wrong separation of concerns

#### No Cascade: Steps Never Complete
- ❌ Taskless steps have no tasks to complete them
- ❌ Would remain stuck in 'created' state forever

### Performance Summary

| Approach | Calls | Operations | Result |
|----------|-------|------------|--------|
| **Initial (wrong) analysis** | 10,000 | 500,000 | 🔴 Catastrophic |
| **Cascade in start_ready_steps** | 10,000 | 10,050 | 🟡 Wasteful |
| **Conditional cascade (solution)** | 1 | 50 | 🟢 Optimal |

The simple conditional approach is **200x better** than calling from start_ready_steps and **10,000x better** than the initially feared scenario.

### Realtime Events

Each completed step needs to send a realtime event. Add to the loop:

```sql
-- Send realtime events for completed steps
broadcast AS (
  SELECT realtime.send(
    jsonb_build_object(
      'event_type', 'step:completed',
      'run_id', c.run_id,
      'step_slug', c.step_slug,
      'status', 'completed',
      'started_at', c.started_at,
      'completed_at', c.completed_at,
      'output', '[]'::jsonb  -- Empty output for taskless
    ),
    concat('step:', c.step_slug, ':completed'),
    concat('pgflow:run:', c.run_id),
    false
  )
  FROM completed c
)
```

### Integration Points

```sql
-- In start_flow
PERFORM cascade_complete_taskless_steps(run_id)  -- First
PERFORM start_ready_steps(run_id)                -- Second

-- In complete_task  
-- After completing task and updating dependents:
PERFORM cascade_complete_taskless_steps(run_id)  -- First
PERFORM start_ready_steps(run_id)                -- Second
```

## Testing Strategy

Create dedicated test folder: `pkgs/core/supabase/tests/cascade_taskless/`

### Test cases needed

1. **Basic cascade**: Chain of 3 taskless steps
2. **Fan-in**: Multiple deps converging on taskless step
3. **Mixed flow**: Alternating taskless and normal steps
4. **Empty array maps**: Current use case
5. **Entire taskless flow**: Should complete synchronously
6. **No cascade**: Single taskless step with normal dependent
7. **Realtime events**: Verify each completed step sends event

### Test-First Development

1. Write failing test for simplest case
2. Implement minimal cascade logic
3. Add complex pattern test
4. Extend implementation
5. Repeat until all patterns covered

## Benefits

- **Generic**: Handles all taskless step types, current and future
- **Decoupled**: Clear separation of concerns
- **Efficient**: Batch operations, minimal queries
- **Future-proof**: Ready for worker process separation
- **Testable**: Each function has single responsibility

## Migration Notes

- No schema changes needed
- Pure function additions
- Backward compatible
- Can be deployed independently