# Why Ghost Steps: Architecture Decision for Preprocessing and Conditions

## Problem Statement

pgflow needs to support step preprocessing and conditional execution while maintaining its core architectural principles:

1. Edge Worker cannot change - it only processes tasks
2. Postgres remains the single source of truth
3. Simple, robust design without exotic features
4. MVP-focused implementation

Two approaches were considered: **Ghost Steps** and **Explicit Tasks**.

## Approaches Evaluated

### Ghost Steps Approach
Generate additional steps with `gen_` prefix that represent array preprocessing (`gen_array_`) and conditions (`gen_cond_`). The DSL creates these ghost steps and rewrites dependencies so the SQL core treats them as regular steps.

Example dependency chain:
```
load_data → gen_array_send_email → send_email
```

### Explicit Tasks Approach  
Model preprocessing and condition evaluation as first-class task types in the SQL core. The system would spawn special task types and handle them differently in `complete_task()`.

## Decision: Ghost Steps

**Ghost Steps was chosen because it aligns perfectly with pgflow's architectural principles while requiring minimal system changes.**

## Rationale

### 1. Preserves System Simplicity

Ghost Steps maintain pgflow's core principle: **"Ghost steps are regular steps - The SQL core treats them identically to user-defined steps."**

- **SQL Core**: Zero changes required - ghost steps use existing step tables, functions, and state management
- **Edge Worker**: Zero changes required - executes ghost step handlers like any other step handler
- **Infrastructure Reuse**: All existing mechanics work unchanged (polling, retries, monitoring, transactions)

Explicit Tasks would violate this principle by introducing special task types requiring conditional logic throughout the SQL core.

### 2. Respects MVP Philosophy

pgflow's MVP status demands "PRIORITIZE CUTTING SCOPE" and "SIMPLIFY AGGRESSIVELY."

**Ghost Steps:**
- Contained complexity in DSL only
- Leverages existing infrastructure completely  
- No breaking changes to existing components

**Explicit Tasks:**
- Distributed complexity across SQL core, clients, and potentially DSL
- Requires new infrastructure for task type handling
- Breaking changes to core APIs

### 3. Lower Implementation Risk

**Ghost Steps Risk Profile:**
- **Localized risk**: Complexity contained in DSL
- **Gradual rollout**: Can implement incrementally without affecting existing flows
- **Fallback possible**: Issues affect only new DSL features

**Explicit Tasks Risk Profile:**
- **Distributed risk**: Changes affect the most critical system component (SQL core)
- **Coordinated deployment**: Requires synchronized updates across components
- **Higher blast radius**: Issues could affect core workflow execution

### 4. Future Extensibility

The `gen_TYPE_` pattern is infinitely extensible:

```
gen_array_*  - Array preprocessing
gen_cond_*   - Conditions  
gen_retry_*  - Custom retry logic
gen_delay_*  - Dynamic delays
gen_batch_*  - Batching operations
gen_fork_*   - Parallel branches
gen_merge_*  - Result aggregation
```

Each new ghost step type requires:
- DSL logic to generate the appropriate `gen_TYPE_` step
- Zero SQL core changes
- Zero additional collision prevention (all use same `gen_` namespace)

Explicit Tasks would require SQL core modifications and client updates for each new task type.

### 5. Maintains Debuggability

Ghost steps appear in all existing observability tools:
- Visible in dependency graphs
- Show up in monitoring dashboards  
- Participate in logging systems
- Can be queried with standard SQL

This preserves pgflow's transparency principle - everything happening in workflows remains visible and queryable.

### 6. Collision Prevention Solved

The `gen_` prefix provides robust namespace separation:
- **User steps**: Never start with `gen_`
- **Ghost steps**: Always start with `gen_`
- **Future-proof**: Pattern works for unlimited ghost step types
- **Clear identification**: Easy to detect and categorize ghost steps

## Component Impact Summary

| Component | Ghost Steps | Explicit Tasks |
|-----------|-------------|----------------|
| **SQL Core** | No changes | Major changes (task types, conditional logic) |
| **Edge Worker** | No changes | No changes |
| **DSL** | Heavy complexity (contained) | Moderate changes |
| **Client** | Minimal impact | Moderate impact (new task types) |
| **Risk** | Low (localized) | High (distributed) |

## Conclusion

Ghost Steps represents the optimal solution for pgflow's architectural context:

- **Preserves core simplicity** while adding powerful features
- **Respects MVP constraints** with minimal scope expansion  
- **Leverages existing infrastructure** completely
- **Contains complexity** in the appropriate layer (DSL)
- **Enables future extensibility** without system-wide changes

This decision allows pgflow to add preprocessing and conditional execution capabilities while maintaining its fundamental design principles: Postgres-first, simple but powerful, and built for rapid MVP iteration.

The Ghost Steps approach transforms what could have been a system-wide architectural change into a DSL-only enhancement, preserving all of pgflow's architectural benefits while enabling advanced workflow patterns.