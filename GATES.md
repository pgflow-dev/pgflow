# Gates and Skipping: Complete Architecture

## Core Insight: All Steps Can Skip

**Any step** can have `status='skipped'`. The difference is **what happens to dependents**:

```sql
-- ALL step types can be skipped
status IN ('created', 'started', 'completed', 'failed', 'skipped')

-- But behavior differs:
-- step_gate: Skip is local (dependents get null input, continue)
-- branch_gate: Skip cascades (all dependents skip)
-- single/array/bool/map: Can be skipped (by gates or conditions)
```

## Two Types of Gates

### 1. Taskless Gates (JSON Conditions)
```typescript
// Creates taskless gate - evaluated in SQL
.step({ 
  skip: { if: { mode: 'draft' } }  // JSON condition
}, handler)

// Generates:
gen_gate_process (taskless, no queue, JSON condition)
```

**SQL Evaluation (no tasks!):**
```sql
-- In start_ready_steps
WHEN step_type IN ('gate', 'branch_gate') AND step.condition IS NOT NULL THEN
  -- No task creation! Evaluate immediately
  IF step_input @> step.condition THEN
    UPDATE step_states SET status = 'completed'
  ELSE
    UPDATE step_states SET status = 'skipped'
  END IF
```

### 2. Task-Based Gates (Bool Step References)
```typescript
// Creates gate that checks bool step output
.step({
  skip: { if: ({ data }) => data.length > 0 }  // Function
}, handler)

// Generates:
gen_bool_process (has tasks, needs queue) → 
gen_gate_process (taskless, checks bool output)
```

## Gate Behavior Rules

| Gate Type | Skip Behavior | Has Tasks | Queue Needed |
|-----------|--------------|-----------|--------------|
| `gate` (or `step_gate`) | **Local skip** - dependents continue with null | ❌ No | ❌ No |
| `branch_gate` | **Cascade skip** - all dependents skip | ❌ No | ❌ No |

**Key Point**: Gates NEVER have tasks or queues - they're pure control flow!

## Skip Propagation Patterns

### Local Skip (step_gate)
```typescript
.step({ 
  slug: 'optional_enrichment',
  skip: { if: { enrichment_enabled: false } }
}, enrichHandler)

.step({
  slug: 'process',
  dependsOn: ['optional_enrichment']
}, ({ optional_enrichment }) => {
  // optional_enrichment can be null if skipped
  const data = optional_enrichment || getDefaultData();
})
```

**Execution:**
1. `gen_gate_optional_enrichment` evaluates JSON → `status='skipped'`
2. `optional_enrichment` → `status='skipped'` (no task runs)
3. `process` → `status='completed'` (runs with null input)

### Cascade Skip (branch_gate)
```typescript
.branch({
  slug: 'testing',
  skip: { if: { env: 'production' } }
}, (b) => {
  b.step({ slug: 'unit_tests' }, handler)
  b.step({ slug: 'integration_tests' }, handler)
})
```

**Execution:**
1. `gen_branch_gate_testing` evaluates JSON → `status='skipped'`
2. `testing__unit_tests` → `status='skipped'` (cascaded)
3. `testing__integration_tests` → `status='skipped'` (cascaded)

## Complete Examples

### JSON Condition (Taskless)
```typescript
.step({
  slug: 'validate',
  skip: { if: { validation_required: false } }  // JSON
}, validateHandler)

// Generates:
// gen_gate_validate (taskless, no queue, evaluates JSON)
//   └→ validate (single, needs queue if not skipped)
```

### Function Condition (Bool + Gate)
```typescript
.step({
  slug: 'process',
  skip: { if: async ({ user }) => {
    const account = await getAccount(user.id);
    return !account.active;
  }}
}, processHandler)

// Generates:
// gen_bool_process (bool type, HAS tasks, needs queue)
//   └→ gen_gate_process (gate type, taskless, checks bool output)
//       └→ process (single type)
```

### Mixed Conditions in Complex Flow
```typescript
.branch({
  slug: 'features',
  skip: { if: { features_enabled: false } }  // JSON, taskless
}, (b) => {
  b.step({
    slug: 'premium',
    skip: { if: 'is_premium_user' }  // References bool step
  }, premiumHandler)
  
  b.step({
    slug: 'analytics', 
    skip: { if: ({ config }) => !config.analytics }  // Function
  }, analyticsHandler)
})
```

**Generates:**
```
gen_branch_gate_features (taskless, JSON condition)
  ├→ gen_gate_features__premium (taskless, checks is_premium_user output)
  │   └→ features__premium
  └→ gen_bool_features__analytics (has tasks)
      └→ gen_gate_features__analytics (taskless)
          └→ features__analytics
```

## Key Architecture Points

1. **Gates are ALWAYS taskless** - they evaluate conditions in SQL
2. **Bool steps have tasks** - they run TypeScript functions
3. **All steps can skip** - but gates control HOW skip propagates
4. **Queue irrelevant for gates** - they don't spawn tasks
5. **Two skip modes**:
   - `step_gate`: Local skip (optional dependency)
   - `branch_gate`: Cascade skip (entire branch)

## SQL Implementation

```sql
-- Taskless gate evaluation in start_ready_steps
CASE 
  WHEN step_type IN ('gate', 'branch_gate') THEN
    -- No tasks, no queue, pure SQL
    CASE
      WHEN step.json_condition IS NOT NULL THEN
        -- JSON condition
        IF NOT (step_input @> step.json_condition) THEN
          mark_skipped()
        END IF
      WHEN step.bool_ref IS NOT NULL THEN
        -- Check bool step output
        IF (SELECT output FROM bool_step) = true THEN
          mark_skipped()
        END IF
    END
    
    -- Handle skip propagation
    IF status = 'skipped' THEN
      CASE step_type
        WHEN 'gate' THEN
          -- Local: dependents continue with null
        WHEN 'branch_gate' THEN
          -- Cascade: mark all dependents skipped
          UPDATE step_states SET status = 'skipped'
          WHERE step_slug LIKE 'branch_prefix__%'
      END
    END IF
END
```

This architecture cleanly separates control flow (gates) from execution (steps) while allowing flexible skip conditions!