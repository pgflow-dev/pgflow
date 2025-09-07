# pgflow Post-MVP Features and Extensions

## Overview

This document contains features that were originally considered for MVP but deferred to maintain simplicity and focus. These features are still architecturally valid and planned for future implementation after the core map functionality is stable.

**Note**: The current MVP focuses on `.array()` DSL sugar + `.map()` step type with queue routing. All validation and advanced features are deferred.

## Deferred Features

### 1. Database-Side Array Validation

**What was deferred**: SQL-based validation of array step outputs

#### Original Implementation Plan
```sql
-- In complete_task function
CASE 
  WHEN step.validates = 'array' AND jsonb_typeof(output) != 'array' THEN 
    UPDATE step_states SET 
      status = 'failed',
      failure_reason = 'schema_validation_error',
      error_message = 'Expected array output, got ' || jsonb_typeof(output)
  ELSE 
    complete_step(output)
END
```

#### Schema Changes Required
```sql
-- Option A: Validation column approach
ALTER TABLE pgflow.steps 
  ADD COLUMN validates TEXT CHECK (validates IN ('array', 'boolean', NULL));

-- Option B: step_type approach  
ALTER TABLE pgflow.steps 
  ADD CONSTRAINT steps_step_type_check 
  CHECK (step_type IN ('single', 'array', 'map'));
```

#### Why Deferred
- **Worker-side validation** with Zod schemas provides better error messages
- **Simpler SQL Core** - orchestration without validation logic
- **Type safety** - validation happens where types are known (TypeScript)

#### Future Implementation
- Consider for schema compliance auditing
- Useful for non-TypeScript workers  
- Could complement worker-side validation

---

### 2. Empty Array Handling Modes

**What was deferred**: Configurable behavior for empty array processing

#### Original Design
```sql
-- Schema
ALTER TABLE pgflow.steps
  ADD COLUMN empty_array_mode TEXT DEFAULT 'fail' 
  CHECK (empty_array_mode IN ('fail', 'skip', 'complete'));
```

```typescript
// DSL Usage
.array({ 
  slug: 'items',
  emptyMode: 'skip'  // 'fail' | 'skip' | 'complete'
}, handler)
```

#### Behavior Modes
- **'fail'**: Empty array causes step failure
- **'skip'**: Empty array skips step and dependents  
- **'complete'**: Empty array completes normally with `[]`

#### Why Deferred
- **MVP complexity reduction** - empty arrays just auto-complete with `[]`
- **Skip logic dependency** - proper skip handling needs gate system
- **User feedback needed** - unclear which behaviors are most useful

#### Future Implementation
- Add after skip/gate system is implemented
- Consider Zod schema-driven empty validation
- May integrate with conditional processing

---

### 3. Dedicated Array Step Type

**What was deferred**: `step_type='array'` as distinct execution pattern

#### Original Design
```sql
step_type IN ('single', 'array', 'map')
```

With array-specific SQL logic:
```sql
-- Array step spawning (1 task)
WHEN step_type = 'array' THEN generate_series(0, 0)

-- Array step validation  
WHEN step_type = 'array' THEN validate_array_output()

-- Array step completion
WHEN step_type = 'array' THEN setup_map_dependents()
```

#### Why Deferred
- **Architectural inconsistency** - doesn't fit step_type behavioral model
- **Complexity without benefit** - `.array()` as DSL sugar is simpler
- **Validation paradigm shift** - moving to worker-side validation

#### Future Consideration
- May revisit if database validation becomes important
- Could be useful for schema compliance
- Consider if non-TypeScript workers need array guarantees

---

### 4. Bool Step Type for Conditions

**What was deferred**: Boolean decision points in workflows

#### Planned Implementation
```typescript
.bool({ 
  slug: 'should_continue',
  queue: false  // Manual human decision
}, ({ results }) => results.success_rate > 0.8)

.step({
  slug: 'next_action',
  dependsOn: ['should_continue'],
  skipIf: { should_continue: false }
}, handler)
```

#### Schema Requirements
```sql
step_type IN ('single', 'array', 'map', 'bool')

-- Bool step validation
WHEN step_type = 'bool' AND jsonb_typeof(output) != 'boolean' THEN
  fail_step('condition_error', 'Expected boolean output')
```

#### Why Deferred
- **Gate system dependency** - bool steps need skip/gate infrastructure
- **Scope creep** - conditional logic is complex domain
- **User story clarity** - need real use cases to design well

#### Future Implementation  
- Part of conditional processing phase
- Integrate with gate-based skipping
- Support both programmatic and human decisions

---

### 5. Gate-Based Skip System

**What was deferred**: Sophisticated skip condition and propagation system

#### Planned Architecture
```typescript
// Complex skip conditions
.step({
  slug: 'process',
  skip: { 
    if: { mode: 'draft' },           // JSON condition
    cascade: true                    // Skip dependents too
  }
}, handler)

.step({
  slug: 'process',
  skip: { 
    if: ({ data }) => data.length === 0,  // Function condition  
    mode: 'optional'                      // Don't fail, just skip
  }
}, handler)
```

#### Implementation Complexity
- **Ghost step generation** for function conditions
- **Gate step types** (`step_gate`, `branch_gate`)  
- **Skip propagation logic** in SQL
- **Complex DSL parsing** for condition variants

#### Why Deferred
- **High complexity** - gates were most complex part of original design
- **MVP focus** - parallel processing more valuable than skip logic
- **User validation** - need to prove skip patterns are actually needed

#### Future Implementation
- Major feature requiring dedicated implementation phase
- Consider simpler alternatives first (manual conditions)
- Build on bool step foundation

---

### 6. Branch Preprocessing

**What was deferred**: Nested workflow composition with input transformation

#### Planned Design
```typescript
.branch({
  slug: 'conditional_flow',
  input: ({ run, deps }) => transformInput(run, deps),
  condition: 'should_process'
}, ConditionalSubFlow)
```

#### Implementation Requirements
- **Ghost preprocessing steps** (`gen_prep_*`)
- **Embedded flow execution** 
- **Input/output type transformation**
- **Scope isolation** between parent and child flows

#### Why Deferred
- **Conditional dependency** - needs bool/gate system first
- **Complexity explosion** - nested flows are architectural challenge  
- **Use case validation** - need real scenarios to design correctly

#### Future Implementation
- Major architectural feature
- Consider after conditional processing is stable
- May require fundamental changes to execution model

---

### 7. pg_jsonschema Database Validation

**What was deferred**: PostgreSQL-native JSON Schema validation

#### Planned Integration
```sql
-- Store JSON schemas in database
ALTER TABLE pgflow.steps 
  ADD COLUMN input_schema JSONB,
  ADD COLUMN output_schema JSONB;

-- Validation in complete_task
IF output_schema IS NOT NULL THEN
  IF NOT jsonschema_is_valid(output_schema, task_output) THEN
    UPDATE step_states SET 
      status = 'failed',
      failure_reason = 'schema_validation_error',
      error_details = jsonschema_validation_errors(output_schema, task_output)
  END IF
END IF
```

#### Why Deferred
- **Worker-side superiority** - Zod provides better errors and type safety
- **Extension dependency** - requires pg_jsonschema extension
- **Double validation** - redundant with worker-side Zod validation

#### Future Implementation
- Consider for audit/compliance scenarios
- Useful for non-TypeScript workers
- May complement rather than replace worker validation

---

### 8. Complex Queue Routing Patterns

**What was deferred**: Advanced queue assignment and load balancing

#### Deferred Features
```typescript
// Dynamic queue selection
.step({ 
  queue: ({ priority }) => priority > 5 ? 'urgent' : 'normal'
}, handler)

// Load balancing
.step({ 
  queue: ['worker-1', 'worker-2', 'worker-3']  // Round-robin
}, handler)

// Conditional routing
.step({ 
  queue: ({ region }) => `worker-${region}`
}, handler)
```

#### Why Deferred
- **Static routing sufficient** for MVP validation
- **Complex implementation** - dynamic routing needs runtime evaluation
- **Infrastructure dependency** - need multiple worker pools to test

#### Future Implementation
- Add after basic queue routing is proven
- Consider worker pool management
- May require changes to task dispatching logic

---

## Implementation Priority Order

### Phase 1 (Post-MVP): Zod Schema Integration
- Worker-side output validation
- Rich error messages
- Type safety enforcement

### Phase 2: Conditional Processing Foundation  
- Bool step type
- Basic skip conditions (JSON only)
- Manual decision points

### Phase 3: Advanced Skip Logic
- Gate system implementation  
- Skip propagation modes
- Function-based conditions

### Phase 4: Complex Workflow Patterns
- Branch preprocessing
- Nested workflow composition
- Advanced queue routing

### Phase 5: Database Validation (Optional)
- pg_jsonschema integration
- Audit and compliance features
- Non-TypeScript worker support

---

## Architecture Considerations for Future Features

### Maintaining Simplicity
- Each feature should be **optional** and **additive**
- Complex features should not impact simple use cases
- Clear upgrade paths from basic to advanced usage

### Layer Separation
- **DSL Layer**: User-friendly syntax, type safety
- **Worker Layer**: Execution, validation, error handling
- **SQL Core Layer**: Orchestration, state management, persistence

### Testing Strategy  
- Comprehensive test coverage for each feature
- Backward compatibility validation
- Performance impact measurement
- User experience validation

### Documentation Requirements
- Clear migration guides
- Feature interaction documentation  
- Best practices and patterns
- Troubleshooting guides

---

## Decision Log

### Why These Features Were Deferred

1. **Complexity Management**: MVP focuses on core value (parallel processing)
2. **User Validation**: Need real usage patterns before building advanced features
3. **Architectural Clarity**: Worker-side validation emerged as superior approach
4. **Implementation Bandwidth**: Limited development time requires focus
5. **Dependency Ordering**: Some features depend on others being stable first

### Lessons for Future Implementation

1. **Start Simple**: Prove basic patterns before adding complexity
2. **User-Driven**: Build features based on actual user pain points
3. **Layer Consistency**: Maintain clean separation of concerns
4. **Type Safety**: Leverage TypeScript throughout the stack
5. **Optional Complexity**: Advanced features should not impact simple cases

The features in this document represent thoughtful design work that should be preserved and implemented when the timing is right and user needs are validated.