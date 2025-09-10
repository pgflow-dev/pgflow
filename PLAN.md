# pgflow MVP Phase 1: `.array()` DSL Method Implementation Plan

## Executive Summary

Phase 1 delivers immediate value through type-safe array creation while maintaining zero risk to existing functionality. This phase focuses exclusively on the DSL layer, adding a `.array()` method that provides semantic clarity and compile-time validation for array-returning handlers while functioning as sugar over the existing `.step()` method.

**Key Benefits:**
- **Immediate type safety**: TypeScript enforces `Array<T>` return types at compile time
- **Zero breaking changes**: Purely additive functionality, no schema modifications
- **Full feature parity**: Complete compatibility with existing step features
- **Foundation for future phases**: Enables testing and validation of array workflows

## Technical Overview

### Design Philosophy

The `.array()` method follows pgflow's core principle of "simplest implementation that works":

1. **Sugar over `.step()`** - Reuses 100% of existing validation, dependency management, and execution logic
2. **Compile-time validation** - TypeScript constraints enforce array returns without runtime overhead
3. **Semantic clarity** - Clear intent when creating array-producing steps
4. **Zero runtime cost** - No additional validation, wrapping, or transformation

### Implementation Strategy

**Pure TypeScript Enhancement:**
- Add `.array()` method to the `Flow` class that delegates to existing `.step()` method
- Use TypeScript generic constraints to enforce `Array<T>` return types
- Leverage existing type system for input/output inference and dependency validation

**Current Architecture Compatibility:**
```typescript
// Current .step() usage
.step({ slug: 'items' }, ({ run }) => fetchItemsAsArray(run.userId))

// New .array() usage - semantically clearer, type-enforced
.array({ slug: 'items' }, ({ run }) => fetchItemsAsArray(run.userId))
```

## Detailed Technical Implementation

### Method Signature Design

**Location:** `/home/jumski/Code/pgflow-dev/pgflow/worktrees/review-fanout-steps-plan/pkgs/dsl/src/dsl.ts`

```typescript
// Add to Flow class after existing .step() method (around line 411)
array<
  Slug extends string,
  THandler extends (
    input: StepInput<this, Deps>,
    context: BaseContext & TContext  
  ) => Array<Json> | Promise<Array<Json>>,
  Deps extends Extract<keyof Steps, string> = never
>(
  opts: Simplify<{ slug: Slug; dependsOn?: Deps[] } & StepRuntimeOptions>,
  handler: THandler
): Flow<
  TFlowInput, 
  TContext & BaseContext & ExtractHandlerContext<THandler>, 
  Steps & { [K in Slug]: AwaitedReturn<THandler> }, 
  StepDependencies & { [K in Slug]: Deps[] }
> {
  // Delegate to existing .step() method for maximum code reuse
  return this.step(opts, handler);
}
```

### Type Constraint Strategy

**Core Constraint:**
```typescript
THandler extends (...args: any[]) => Array<Json> | Promise<Array<Json>>
```

This constraint ensures:
- **Compile-time validation**: TypeScript will reject non-array returns
- **Promise support**: Async handlers returning `Promise<Array<T>>` work correctly
- **Element type inference**: TypeScript extracts `T` from `Array<T>` for downstream steps

**Error Examples:**
```typescript
// ✅ Valid - TypeScript accepts
.array({ slug: 'items' }, () => [1, 2, 3])
.array({ slug: 'async_items' }, async () => [{ id: 1 }, { id: 2 }])

// ❌ Invalid - TypeScript rejects at compile time
.array({ slug: 'invalid' }, () => 42)           // number
.array({ slug: 'invalid2' }, () => "string")     // string  
.array({ slug: 'invalid3' }, async () => null)   // Promise<null>
```

### Integration Points

**Full Feature Support:**
- **Dependencies**: `dependsOn` parameter works identically to `.step()`
- **Runtime Options**: `maxAttempts`, `baseDelay`, `timeout`, `startDelay` all supported
- **Validation**: Leverages existing `validateSlug()` and `validateRuntimeOptions()`
- **Error Handling**: Same error messages and patterns as `.step()`

**Type System Integration:**
- **Input Construction**: Uses existing `StepInput<this, Deps>` utility type for clean, maintainable input type construction
- **Output Inference**: Leverages existing `AwaitedReturn<THandler>` utility  
- **Dependency Validation**: Reuses existing compile-time dependency constraints
- **Utility Type Usage**: Follows pgflow's pattern of using well-designed utility types rather than manual generic construction

## Comprehensive Testing Strategy

### Test File Structure

```
pkgs/dsl/__tests__/
├── runtime/
│   └── array-method.test.ts          # Runtime behavior validation
├── types/
│   └── array-method.test-d.ts        # Compile-time type validation
└── integration/
    └── array-integration.test.ts     # End-to-end workflow testing
```

### Runtime Tests Implementation

**File:** `/home/jumski/Code/pgflow-dev/pgflow/worktrees/review-fanout-steps-plan/pkgs/dsl/__tests__/runtime/array-method.test.ts`

**Test Categories:**

1. **Basic Functionality**
   - Handler registration and retrieval
   - Identical behavior to `.step()` for array handlers
   - Proper step definition creation

2. **Options Support**  
   - All `StepRuntimeOptions` (maxAttempts, baseDelay, timeout, startDelay)
   - Dependency specification with `dependsOn`
   - Options validation and storage

3. **Validation Integration**
   - Slug validation via `validateSlug()` calls
   - Runtime options validation via `validateRuntimeOptions()` calls
   - Error propagation from validation functions

4. **Integration Workflows**
   - Steps depending on array steps
   - Array steps depending on other steps  
   - Multi-level dependency chains

**Key Test Cases:**
```typescript
describe('.array() method', () => {
  describe('basic functionality', () => {
    it('adds an array step with correct handler', () => {
      const handler = () => [1, 2, 3];
      const flow = new Flow({ slug: 'test' }).array({ slug: 'items' }, handler);
      expect(flow.getStepDefinition('items').handler).toBe(handler);
    });

    it('behaves identically to .step() for array-returning handlers', () => {
      const handler = () => [{ id: 1 }, { id: 2 }];
      const arrayFlow = new Flow({ slug: 'test' }).array({ slug: 'items' }, handler);
      const stepFlow = new Flow({ slug: 'test' }).step({ slug: 'items' }, handler);
      
      expect(arrayFlow.getStepDefinition('items')).toEqual(stepFlow.getStepDefinition('items'));
    });
  });

  describe('integration', () => {
    it('allows steps to depend on array steps', async () => {
      const flow = new Flow<{ count: number }>({ slug: 'test' })
        .array({ slug: 'items' }, ({ run }) => Array(run.count).fill(0).map((_, i) => i))
        .step({ slug: 'sum', dependsOn: ['items'] }, ({ items }) => 
          items.reduce((sum, item) => sum + item, 0)
        );

      const itemsHandler = flow.getStepDefinition('items').handler;
      const sumHandler = flow.getStepDefinition('sum').handler;

      const itemsResult = await itemsHandler({ run: { count: 5 } });
      const sumResult = await sumHandler({ run: { count: 5 }, items: itemsResult });

      expect(itemsResult).toEqual([0, 1, 2, 3, 4]);
      expect(sumResult).toBe(10);
    });
  });
});
```

### Type Tests Implementation

**File:** `/home/jumski/Code/pgflow-dev/pgflow/worktrees/review-fanout-steps-plan/pkgs/dsl/__tests__/types/array-method.test-d.ts`

**Test Categories:**

1. **Return Type Enforcement**
   - Accept valid array returns (sync/async)
   - Reject non-array returns with `@ts-expect-error`
   - Handle complex nested array types

2. **Type Inference**
   - Correct element type extraction from `Array<T>`
   - Proper input type construction for dependent steps
   - Complex nested object array handling

3. **Dependency Validation**
   - Compile-time dependency validation
   - Prevent access to non-dependencies
   - Multi-level dependency type checking

**Key Type Test Cases:**
```typescript
describe('.array() type constraints', () => {
  describe('return type enforcement', () => {
    it('should accept handlers that return arrays', () => {
      new Flow<{}>({ slug: 'test' })
        .array({ slug: 'numbers' }, () => [1, 2, 3])
        .array({ slug: 'objects' }, () => [{ id: 1 }, { id: 2 }])
        .array({ slug: 'async' }, async () => ['a', 'b', 'c']);
    });

    it('should reject handlers that return non-arrays', () => {
      new Flow<{}>({ slug: 'test' })
        // @ts-expect-error - should reject non-array return
        .array({ slug: 'invalid' }, () => 42)
        // @ts-expect-error - should reject string return  
        .array({ slug: 'invalid2' }, () => 'not an array');
    });
  });

  describe('type inference', () => {
    it('should provide correct input types for dependent steps', () => {
      new Flow<{ count: number }>({ slug: 'test' })
        .array({ slug: 'items' }, ({ run }) => Array(run.count).fill(0))
        .step({ slug: 'process', dependsOn: ['items'] }, (input) => {
          expectTypeOf(input).toMatchTypeOf<{
            run: { count: number };
            items: number[];
          }>();
          return input.items.length;
        });
    });
  });
});
```

## Implementation Timeline

### Day-by-Day Breakdown

**Day 1: API Design & Type Tests**
- Morning: Design method signature and type constraints
- Afternoon: Implement comprehensive type tests (`array-method.test-d.ts`)
- Outcome: Compile-time API validation complete

**Day 2: Core Implementation**
- Morning: Implement `.array()` method in `dsl.ts`
- Afternoon: Basic runtime tests passing
- Outcome: Method functional with basic validation

**Day 3: Comprehensive Testing**
- Morning: Complete runtime test suite (`array-method.test.ts`)
- Afternoon: Integration tests and edge cases
- Outcome: Full test coverage achieved

**Day 4: Integration & Validation**  
- Morning: End-to-end integration testing
- Afternoon: Cross-validation with existing test suite
- Outcome: Zero breaking changes confirmed

**Day 5: Documentation & Polish**
- Morning: Code documentation and examples
- Afternoon: Performance validation and final review
- Outcome: Phase 1 complete and ready for use

## Success Criteria

### Primary Success Metrics

1. **✅ Compile-time Type Safety**
   - `.array()` method rejects non-array handlers with clear TypeScript errors
   - Type inference works correctly for array element types
   - Dependent steps receive properly typed array inputs

2. **✅ Runtime Equivalence**
   - `.array()` method produces identical step definitions to `.step()` for array handlers
   - All existing step features work identically (dependencies, options, validation)
   - Error messages and validation behavior unchanged

3. **✅ Feature Completeness**
   - Full support for `StepRuntimeOptions` (maxAttempts, baseDelay, timeout, startDelay)
   - Complete dependency system integration (`dependsOn` parameter)
   - Proper integration with existing validation utilities

4. **✅ Zero Breaking Changes**
   - All existing flows continue working unchanged
   - No modifications to schema, SQL functions, or worker logic
   - Backward compatibility guaranteed

### Technical Validation

**Type System Tests:**
- 100% pass rate for type tests (`vitest typecheck`)
- No TypeScript compilation errors
- Proper type inference in complex scenarios

**Runtime Tests:**
- 100% test coverage for new functionality
- All existing DSL tests continue passing
- Integration tests validate end-to-end workflows

**Performance Validation:**
- No measurable impact on compilation time
- Zero runtime overhead compared to `.step()` method
- Memory usage unchanged

## Risk Analysis & Mitigation

### Identified Risks

**1. Type System Complexity**
- **Risk**: Complex generic constraints may cause TypeScript performance issues
- **Mitigation**: Use proven patterns from existing `.step()` method implementation
- **Fallback**: Simplify constraints if performance issues arise

**2. Breaking Changes** 
- **Risk**: Unintended modifications to existing functionality
- **Mitigation**: Delegate everything to `.step()` method - zero new logic paths
- **Validation**: Comprehensive regression testing

**3. Incomplete Feature Parity**
- **Risk**: Missing support for existing step features
- **Mitigation**: Use identical options interface and parameter validation
- **Testing**: Direct comparison tests between `.array()` and `.step()`

### Mitigation Strategies

**Incremental Implementation:**
1. Type tests first - validate API design before implementation
2. Minimal implementation - just enough to pass type tests
3. Progressive enhancement - add runtime validation incrementally
4. Regression testing - ensure no existing functionality breaks

**Rollback Plan:**
- Single method addition - easy to remove if issues arise
- No schema changes - zero database impact
- Feature flag potential - could be conditionally enabled

## Deliverables

### Code Changes

**Primary Implementation:**
1. `/home/jumski/Code/pgflow-dev/pgflow/worktrees/review-fanout-steps-plan/pkgs/dsl/src/dsl.ts`
   - Add `.array()` method to `Flow` class (approximately 15 lines)

**Test Suite:**
2. `/home/jumski/Code/pgflow-dev/pgflow/worktrees/review-fanout-steps-plan/pkgs/dsl/__tests__/runtime/array-method.test.ts`
   - Comprehensive runtime behavior tests (~200 lines)

3. `/home/jumski/Code/pgflow-dev/pgflow/worktrees/review-fanout-steps-plan/pkgs/dsl/__tests__/types/array-method.test-d.ts`
   - Complete type validation test suite (~150 lines)

**Integration Testing:**
4. `/home/jumski/Code/pgflow-dev/pgflow/worktrees/review-fanout-steps-plan/pkgs/dsl/__tests__/integration/array-integration.test.ts`
   - End-to-end workflow validation (~100 lines)

### Documentation

**Code Documentation:**
- JSDoc comments for the `.array()` method
- Type parameter documentation
- Usage examples in comments

**No External Documentation Required:**
- Phase 1 is purely additive to existing API
- Full documentation planned for Phase 4 when complete

### Validation Artifacts

**Test Reports:**
- Runtime test results showing 100% pass rate
- Type test results confirming compile-time validation
- Coverage reports demonstrating complete test coverage

**Compatibility Validation:**
- Existing test suite results (no regressions)
- Performance benchmarks (no degradation)
- Memory usage analysis (no increase)

## Future Phase Integration

### Phase 2 Preparation

The `.array()` method implementation provides the foundation for Phase 2 queue routing:

**Queue Parameter Addition:**
```typescript
// Phase 1 (current)
.array({ slug: 'items' }, handler)

// Phase 2 (future) - extending options interface
.array({ slug: 'items', queue: 'data_processor' }, handler)
.array({ slug: 'manual_items', queue: false }, handler)
```

**Implementation Strategy:**
- Options interface extension (non-breaking)
- Parameter forwarding to `.step()` method
- Zero changes to core `.array()` logic

### Phase 4 Integration

The type system foundation enables seamless `.map()` method integration:

**Type Inference Chain:**
```typescript
// Array step creates foundation
.array({ slug: 'items' }, () => [1, 2, 3, 4, 5])

// Map method leverages existing type inference  
.map({ slug: 'doubled', array: 'items' }, (item) => item * 2)
//    ^^^^ item is correctly inferred as 'number'
```

**Architectural Benefits:**
- Array type information already captured in type system
- Element type extraction patterns established
- Dependency validation framework proven

## Conclusion

Phase 1 delivers immediate, tangible value through compile-time type safety while establishing the architectural foundation for pgflow's parallel processing capabilities. The implementation maintains pgflow's core philosophy of simplicity and PostgreSQL-native execution while providing developers with enhanced tooling and confidence.

**Key Achievements:**
- **Zero Risk**: No schema changes, no breaking changes
- **Immediate Value**: Type safety and semantic clarity from day one  
- **Solid Foundation**: Enables confident progression to subsequent phases
- **MVP Philosophy**: Simplest implementation that works, avoiding premature optimization

This phase successfully bridges the gap between pgflow's current capabilities and its parallel processing vision, delivering user value while maintaining the project's commitment to simplicity and reliability.