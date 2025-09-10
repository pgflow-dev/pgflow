# Phase 2b Implementation Plan: DSL and Compilation

## Overview

Phase 2b builds on Phase 2a's SQL Core foundation to deliver the TypeScript DSL `.map()` method and compilation support. This phase focuses on the developer experience layer, providing type-safe map step definition and seamless compilation to the SQL infrastructure established in Phase 2a.

**Timeline**: 3-5 days  
**Risk Level**: LOW-MEDIUM - building on proven Phase 1 patterns and Phase 2a infrastructure  
**Dependencies**: Phase 2a (Map Infrastructure) must be completed  
**Milestone**: Can define `.map()` steps in TypeScript and compile to working SQL

## Core Value Proposition

- **Type-Safe Map Definition**: TypeScript enforces map handler signatures and array dependencies
- **Element Type Inference**: Automatic extraction of array element types for map handlers
- **Seamless Compilation**: `.map()` steps compile to Phase 2a SQL infrastructure
- **Full DSL Integration**: Maps work with existing dependency system and runtime options
- **Developer Experience**: Clear errors, great autocomplete, intuitive API

## DSL Implementation

### Method Signature Design

Building on the proven patterns from Phase 1's `.array()` method:

**File**: `pkgs/dsl/src/dsl.ts`

```typescript
/**
 * Add a map step to the flow for parallel processing of array elements
 * 
 * Map steps can either:
 * 1. Map over the flow input (when TFlowInput is Array<T> and no array specified)
 * 2. Map over another step's array output (when array: 'stepSlug' is specified)
 * 
 * The handler receives just the individual item, not the full context.
 * 
 * @template Slug - The unique identifier for this step
 * @template ArraySlug - Optional: The slug of the array step to map over
 * @template THandler - The handler function that processes individual items
 * @param opts - Step configuration including slug, optional array, and runtime options  
 * @param handler - Function that processes individual items (item, context) => result
 * @returns A new Flow instance with the map step added
 */
map<
  Slug extends string,
  ArraySlug extends Extract<keyof Steps, string> | undefined = undefined,
  THandler extends (
    item: ArraySlug extends string 
      ? ArrayElementType<Steps[ArraySlug]>
      : ArrayElementType<TFlowInput>,
    context: BaseContext & TContext
  ) => Json | Promise<Json>
>(
  opts: Simplify<{
    slug: Slug;
    array?: ArraySlug; // Optional: if not specified, maps over flow input
    queue?: string | false; // Optional queue routing (Phase 3 infrastructure)
  } & StepRuntimeOptions>,
  handler: THandler
): Flow<
  TFlowInput,
  TContext & BaseContext & ExtractHandlerContext<THandler>,
  Steps & { [K in Slug]: Array<AwaitedReturn<THandler>> },
  StepDependencies & { [K in Slug]: ArraySlug extends string ? [ArraySlug] : [] }
> {
  type RetType = Array<AwaitedReturn<THandler>>;
  type NewSteps = MergeObjects<Steps, { [K in Slug]: RetType }>;
  type NewDependencies = MergeObjects<
    StepDependencies,
    { [K in Slug]: ArraySlug extends string ? [ArraySlug] : [] }
  >;

  const slug = opts.slug as Slug;

  // Validate the step slug
  validateSlug(slug);

  if (this.stepDefinitions[slug]) {
    throw new Error(`Step "${slug}" already exists in flow "${this.slug}"`);
  }

  // Determine dependencies: array param translates to single dependency
  const dependencies = opts.array ? [opts.array] : [];
  
  // Validate array dependency if specified
  if (opts.array && !this.stepDefinitions[opts.array as string]) {
    throw new Error(`Map step "${slug}" depends on undefined array step "${opts.array}"`);
  }
  
  // For root maps (no array specified), validate flow input is array
  if (!opts.array) {
    // This validation would happen at compile time via TypeScript,
    // but we can add runtime check in compileFlow
  }

  // Extract RuntimeOptions from opts (excluding map-specific options)
  const options: StepRuntimeOptions = {};
  if (opts.maxAttempts !== undefined) options.maxAttempts = opts.maxAttempts;
  if (opts.baseDelay !== undefined) options.baseDelay = opts.baseDelay;
  if (opts.timeout !== undefined) options.timeout = opts.timeout;
  if (opts.startDelay !== undefined) options.startDelay = opts.startDelay;
  if (opts.queue !== undefined) options.queue = opts.queue;

  // Validate runtime options
  validateRuntimeOptions(options, { optional: true });

  // Create step definition with map-specific metadata
  const newStepDefinition: MapStepDefinition<TFlowInput, RetType, BaseContext & TContext> = {
    slug,
    handler, // Fixed: Remove unnecessary type assertion
    dependencies: opts.array ? [opts.array] : [], // Fixed: Handle undefined arraySlug for root maps
    options,
    stepType: 'map', // NEW: Mark as map step for compilation
    arrayDependency: opts.array || null, // Fixed: Handle undefined arraySlug for root maps
  };

  const newStepDefinitions = {
    ...this.stepDefinitions,
    [slug]: newStepDefinition,
  };

  const newStepOrder = [...this.stepOrder, slug];

  // Create new flow with updated type parameters
  return new Flow<TFlowInput, TContext & BaseContext & ExtractHandlerContext<THandler>, NewSteps, NewDependencies>(
    { slug: this.slug, ...this.options },
    newStepDefinitions as Record<string, StepDefinition<AnyInput, AnyOutput>>,
    newStepOrder
  ) as Flow<TFlowInput, TContext & BaseContext & ExtractHandlerContext<THandler>, NewSteps, NewDependencies>;
}
```

### Supporting Type Definitions

**File**: `pkgs/dsl/src/dsl.ts`

```typescript
/**
 * Extract the element type from an array type
 * Used to infer the type of individual elements for map step handlers
 */
type ArrayElementType<T> = T extends (infer U)[] ? U : never;

/**
 * Map step definition extends StepDefinition with map-specific metadata
 */
export interface MapStepDefinition<
  TInput extends AnyInput,
  TOutput extends AnyOutput,
  TContext = BaseContext
> extends StepDefinition<TInput, TOutput, TContext> {
  stepType: 'map';
  arrayDependency: string; // The slug of the array step this map depends on
}

/**
 * Type guard to check if a step definition is a map step
 */
export function isMapStepDefinition(
  stepDef: StepDefinition<any, any>
): stepDef is MapStepDefinition<any, any> {
  return 'stepType' in stepDef && stepDef.stepType === 'map';
}

/**
 * Enhanced StepRuntimeOptions with queue support for Phase 3 infrastructure
 */
export interface StepRuntimeOptions extends RuntimeOptions {
  startDelay?: number;
  queue?: string | false; // NEW: Queue routing (silent until Phase 3)
}
```

### Type Inference Validation

The DSL should provide excellent type inference for complex scenarios:

```typescript
// Example: Complex type inference chain
const flow = new Flow<{ userId: string }>({ slug: 'user_processing' })
  .array({ slug: 'users' }, ({ run }) => [
    { id: 1, name: 'Alice', role: 'admin' },
    { id: 2, name: 'Bob', role: 'user' }
  ])
  .map({ slug: 'enriched_users', array: 'users' }, (item) => {
    // item is correctly inferred as: { id: number; name: string; role: string }
    // No run context in map handler - just the item
    return {
      ...item,
      processedAt: Date.now()
    };
  })

// Example: Root map over flow input
const rootMapFlow = new Flow<Array<number>>({ slug: 'process_numbers' })
  .map({ slug: 'doubled' }, (num) => {
    // num is correctly inferred as: number
    return num * 2;
  })
  .step({ slug: 'summary', dependsOn: ['doubled'] }, ({ doubled }) => {
    // doubled is correctly inferred as: Array<number>
    return { sum: doubled.reduce((a, b) => a + b, 0) };
  });

const flow2 = new Flow<{ userId: string }>({ slug: 'user_processing' })
  .array({ slug: 'users' }, ({ run }) => fetchUsers(run.userId))
  .map({ slug: 'enriched_users', array: 'users' }, (item) => {
    // enriched_users is correctly inferred as: Array<{
    //   id: number; 
    //   name: string; 
    //   role: string; 
    //   belongsToUser: boolean; 
    //   processedAt: number; 
    // }>
    return {
      totalUsers: enriched_users.length,
      usersBelongingToFlow: enriched_users.filter(u => u.belongsToUser).length
    };
  });
```

## Compilation Implementation

### compileFlow Updates

**File**: `pkgs/dsl/src/compileFlow.ts`

The compilation needs to handle map steps by generating the correct `add_step` calls with `step_type='map'`:

```typescript
/**
 * Enhanced compilation to handle map steps
 */
export function compileFlow<TFlow extends AnyFlow>(
  flow: TFlow,
  options: CompileOptions = {}
): CompiledFlow {
  // ... existing compilation logic ...

  // Generate step creation SQL
  const stepCreationStatements: string[] = [];
  
  for (const stepSlug of flow.stepOrder) {
    const stepDef = flow.getStepDefinition(stepSlug);
    
    // Determine step type based on metadata or handler analysis
    const stepType = isMapStepDefinition(stepDef) ? 'map' : 'single';
    
    // Dependencies are already in stepDef.dependencies
    // For map steps: either [] (root map) or [arraySlug] (dependent map)
    const dependencies = stepDef.dependencies.length > 0 
      ? `ARRAY[${stepDef.dependencies.map(dep => escapeLiteral(dep)).join(', ')}]`
      : 'ARRAY[]::TEXT[]';
      
    stepCreationStatements.push(
      `SELECT pgflow.add_step(${escapeLiteral(flow.slug)}, ${escapeLiteral(stepSlug)}, '${stepType}', ${dependencies}${compileRuntimeOptions(stepDef.options)});`
    );
    }
  }

  // ... rest of compilation logic ...
}

/**
 * Compile runtime options including queue parameter
 */
function compileRuntimeOptions(options: StepRuntimeOptions): string {
  const params: string[] = [];
  
  // Queue parameter (Phase 3 infrastructure, defaults to NULL)
  if (options.queue !== undefined) {
    params.push(`queue => ${options.queue === false ? 'NULL' : escapeLiteral(options.queue)}`);
  } else {
    params.push('queue => NULL');
  }
  
  // Other runtime options (existing logic)
  if (options.maxAttempts !== undefined) {
    params.push(`opt_max_attempts => ${options.maxAttempts}`);
  }
  if (options.baseDelay !== undefined) {
    params.push(`opt_base_delay => ${options.baseDelay}`);
  }
  if (options.timeout !== undefined) {
    params.push(`opt_timeout => ${options.timeout}`);
  }
  if (options.startDelay !== undefined) {
    params.push(`opt_start_delay => ${options.startDelay}`);
  }
  
  return params.length > 0 ? `, ${params.join(', ')}` : '';
}
```

### Handler Compilation

Map step handlers need special compilation to handle the `item` input parameter:

```typescript
/**
 * Enhanced handler compilation for map steps
 */
function compileStepHandler<TFlow extends AnyFlow>(
  flow: TFlow,
  stepSlug: string,
  stepDef: StepDefinition<any, any>
): string {
  const handlerName = `${flow.slug}_${stepSlug}`;
  
  if (isMapStepDefinition(stepDef)) {
    // Map step handler compilation - SQL provides just the item, worker adds context
    return `
export const ${handlerName} = async (item: any, context: any) => {
  const handler = ${stepDef.handler.toString()};
  return await handler(item, context);
};`;
  } else {
    // Regular step handler compilation (existing logic)
    return `
export const ${handlerName} = async (input: any, context: any) => {
  const handler = ${stepDef.handler.toString()};
  return await handler(input, context);
};`;
  }
}
```

## Comprehensive Testing Strategy

### Test Structure

Following Phase 1's proven testing approach:

```
pkgs/dsl/__tests__/
├── types/
│   └── map-method.test-d.ts           # NEW: Map method type validation
├── runtime/
│   └── map-method.test.ts             # NEW: Map method runtime behavior  
├── integration/
│   └── map-integration.test.ts        # NEW: End-to-end map workflows
└── compilation/
    └── map-compilation.test.ts        # NEW: Map step compilation testing
```

### Key Test Cases Implementation

#### 1. Type Validation Tests

**File**: `pkgs/dsl/__tests__/types/map-method.test-d.ts`

```typescript
import { Flow, type StepInput } from '../../src/index.js';
import { describe, it, expectTypeOf } from 'vitest';

describe('.map() method type constraints', () => {
  describe('array dependency validation', () => {
    it('should only allow existing array steps as dependencies', () => {
      const flow = new Flow<Record<string, never>>({ slug: 'test' })
        .array({ slug: 'items' }, () => [1, 2, 3]);

      // Should work with valid array dependency
      flow.map({ slug: 'processed', array: 'items' }, ({ item }) => item * 2);

      // Type assertion to verify compile-time error for invalid dependency  
      type MapOptions = Parameters<typeof flow.map>[0];
      // @ts-expect-error - should not allow non-existent step
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const invalidArray: MapOptions = { slug: 'invalid', array: 'nonexistent' };
    });

    it('should not allow non-array steps as dependencies', () => {
      const flow = new Flow<Record<string, never>>({ slug: 'test' })
        .step({ slug: 'single_value' }, () => 42);

      // Type assertion to verify compile-time error for non-array dependency
      type MapOptions = Parameters<typeof flow.map>[0];
      // @ts-expect-error - should not allow non-array step as dependency
      // eslint-disable-next-line @typescript-eslint/no-unused-vars  
      const invalidDep: MapOptions = { slug: 'invalid', array: 'single_value' };
    });
  });

  describe('element type inference', () => {
    it('should correctly infer element types from array dependencies', () => {
      new Flow<{ userId: string }>({ slug: 'test' })
        .array({ slug: 'users' }, () => [
          { id: 1, name: 'Alice' }, 
          { id: 2, name: 'Bob' }
        ])
        .map({ slug: 'processed_users', array: 'users' }, ({ run, item }) => {
          // Verify run type inference
          expectTypeOf(run).toMatchTypeOf<{ userId: string }>();
          
          // Verify item type inference from array elements
          expectTypeOf(item).toMatchTypeOf<{ id: number; name: string }>();
          
          return {
            ...item,
            belongsToUser: item.id.toString() === run.userId
          };
        });
    });

    it('should handle complex nested array element types', () => {
      new Flow<{ depth: number }>({ slug: 'test' })
        .array({ slug: 'nested_data' }, () => [
          { 
            category: 'A', 
            items: [{ value: 1, meta: { type: 'number' } }] 
          },
          { 
            category: 'B', 
            items: [{ value: 2, meta: { type: 'number' } }] 
          }
        ])
        .map({ slug: 'flattened', array: 'nested_data' }, ({ item }) => {
          expectTypeOf(item).toMatchTypeOf<{
            category: string;
            items: { value: number; meta: { type: string } }[];
          }>();
          
          return item.items.map(subItem => ({
            category: item.category,
            value: subItem.value,
            type: subItem.meta.type
          }));
        });
    });
  });

  describe('output type inference', () => {
    it('should correctly type map step outputs as arrays', () => {
      const flow = new Flow<Record<string, never>>({ slug: 'test' })
        .array({ slug: 'numbers' }, () => [1, 2, 3])
        .map({ slug: 'doubled', array: 'numbers' }, ({ item }) => item * 2)
        .step({ slug: 'summary', dependsOn: ['doubled'] }, ({ doubled }) => {
          expectTypeOf(doubled).toEqualTypeOf<number[]>();
          return doubled.reduce((sum, n) => sum + n, 0);
        });

      // Verify flow output types
      type FlowSteps = ExtractFlowSteps<typeof flow>;
      expectTypeOf<FlowSteps['doubled']>().toEqualTypeOf<number[]>();
      expectTypeOf<FlowSteps['summary']>().toEqualTypeOf<number>();
    });

    it('should handle async map handlers correctly', () => {
      new Flow<{ delay: number }>({ slug: 'test' })
        .array({ slug: 'items' }, () => [1, 2, 3])
        .map({ slug: 'async_processed', array: 'items' }, async ({ item, run }) => {
          await new Promise(resolve => setTimeout(resolve, run.delay));
          return { processed: item, timestamp: Date.now() };
        })
        .step({ slug: 'count', dependsOn: ['async_processed'] }, ({ async_processed }) => {
          expectTypeOf(async_processed).toEqualTypeOf<{ 
            processed: number; 
            timestamp: number; 
          }[]>();
          return async_processed.length;
        });
    });
  });

  describe('dependency chaining', () => {
    it('should support map steps depending on other map steps', () => {
      new Flow<{ factor: number }>({ slug: 'test' })
        .array({ slug: 'base' }, () => [1, 2, 3])
        .map({ slug: 'doubled', array: 'base' }, ({ item }) => item * 2)
        .map({ slug: 'with_factor', array: 'doubled' }, ({ item, run }) => item * run.factor)
        .step({ slug: 'total', dependsOn: ['with_factor'] }, ({ with_factor }) => {
          expectTypeOf(with_factor).toEqualTypeOf<number[]>();
          return with_factor.reduce((sum, n) => sum + n, 0);
        });
    });

    it('should support regular steps depending on map steps', () => {
      new Flow<{ threshold: number }>({ slug: 'test' })
        .array({ slug: 'scores' }, () => [85, 92, 78, 95])
        .map({ slug: 'passed', array: 'scores' }, ({ item, run }) => item >= run.threshold)
        .step({ slug: 'pass_rate', dependsOn: ['passed'] }, ({ passed }) => {
          expectTypeOf(passed).toEqualTypeOf<boolean[]>();
          return passed.filter(Boolean).length / passed.length;
        });
    });
  });
});
```

#### 2. Runtime Behavior Tests  

**File**: `pkgs/dsl/__tests__/runtime/map-method.test.ts`

```typescript
import { describe, it, vi, beforeEach, expect } from 'vitest';
import { Flow, isMapStepDefinition } from '../../src/dsl.js';
import * as utils from '../../src/utils.js';

describe('.map() method', () => {
  let flow: Flow<any>;

  beforeEach(() => {
    flow = new Flow({ slug: 'test_flow' })
      .array({ slug: 'test_array' }, () => [1, 2, 3]);
  });

  describe('basic functionality', () => {
    it('adds a map step with the correct handler', () => {
      const handler = ({ item }: { item: number }) => item * 2;
      const newFlow = flow.map({ slug: 'doubled', array: 'test_array' }, handler);

      const mapStep = newFlow.getStepDefinition('doubled');
      expect(mapStep.handler).toBe(handler);
      expect(isMapStepDefinition(mapStep)).toBe(true);
    });

    it('stores map step metadata correctly', () => {
      const handler = ({ item }: { item: number }) => item * 2;
      const newFlow = flow.map({ slug: 'doubled', array: 'test_array' }, handler);

      const mapStep = newFlow.getStepDefinition('doubled');
      if (isMapStepDefinition(mapStep)) {
        expect(mapStep.stepType).toBe('map');
        expect(mapStep.arrayDependency).toBe('test_array');
        expect(mapStep.dependencies).toEqual(['test_array']);
      } else {
        throw new Error('Step should be a map step');
      }
    });

    it('throws when adding map step with the same slug', () => {
      const handler = ({ item }: { item: number }) => item;
      const newFlow = flow.map({ slug: 'test_map', array: 'test_array' }, handler);

      expect(() => 
        newFlow.map({ slug: 'test_map', array: 'test_array' }, handler)
      ).toThrowError('Step "test_map" already exists in flow "test_flow"');
    });

    it('stores the step in correct order', () => {
      const newFlow = flow
        .map({ slug: 'first_map', array: 'test_array' }, ({ item }) => item)
        .map({ slug: 'second_map', array: 'first_map' }, ({ item }) => item);

      expect(newFlow.stepOrder).toEqual(['test_array', 'first_map', 'second_map']);
    });
  });

  describe('dependency validation', () => {
    it('validates that array dependency exists', () => {
      expect(() =>
        flow.map(
          // @ts-expect-error - testing runtime validation
          { slug: 'invalid_map', array: 'nonexistent_array' },
          ({ item }) => item
        )
      ).toThrowError('Map step "invalid_map" depends on undefined array step "nonexistent_array"');
    });

    it('allows map step to depend on array step', () => {
      expect(() =>
        flow.map({ slug: 'valid_map', array: 'test_array' }, ({ item }) => item)
      ).not.toThrowError();
    });

    it('allows map step to depend on another map step', () => {
      const newFlow = flow.map({ slug: 'first_map', array: 'test_array' }, ({ item }) => item);

      expect(() =>
        newFlow.map({ slug: 'second_map', array: 'first_map' }, ({ item }) => item)
      ).not.toThrowError();
    });
  });

  describe('slug validation', () => {
    it('calls validateSlug with the correct slug', () => {
      const validateSlugSpy = vi.spyOn(utils, 'validateSlug');
      flow.map({ slug: 'test_map', array: 'test_array' }, ({ item }) => item);
      expect(validateSlugSpy).toHaveBeenCalledWith('test_map');
      validateSlugSpy.mockRestore();
    });

    it('propagates errors from validateSlug', () => {
      const validateSlugSpy = vi.spyOn(utils, 'validateSlug');
      validateSlugSpy.mockImplementation(() => {
        throw new Error('Mock validation error');
      });
      expect(() => 
        flow.map({ slug: 'test', array: 'test_array' }, ({ item }) => item)
      ).toThrowError('Mock validation error');
      validateSlugSpy.mockRestore();
    });
  });

  describe('runtime options', () => {
    it('stores runtime options on the map step definition', () => {
      const newFlow = flow.map(
        {
          slug: 'test_map',
          array: 'test_array',
          maxAttempts: 5,
          baseDelay: 200,
          timeout: 60,
          startDelay: 100,
        },
        ({ item }) => item
      );

      const stepDef = newFlow.getStepDefinition('test_map');
      expect(stepDef.options).toEqual({
        maxAttempts: 5,
        baseDelay: 200,
        timeout: 60,
        startDelay: 100,
      });
    });

    it('validates runtime options', () => {
      const validateRuntimeOptionsSpy = vi.spyOn(utils, 'validateRuntimeOptions');
      flow.map(
        {
          slug: 'test_map',
          array: 'test_array',
          maxAttempts: 3,
          baseDelay: 100,
        },
        ({ item }) => item
      );
      expect(validateRuntimeOptionsSpy).toHaveBeenCalledWith(
        { maxAttempts: 3, baseDelay: 100 },
        { optional: true }
      );
      validateRuntimeOptionsSpy.mockRestore();
    });

    it('stores queue parameter for Phase 3 infrastructure', () => {
      const newFlow = flow.map(
        {
          slug: 'test_map',
          array: 'test_array',
          queue: 'specialized_worker',
        },
        ({ item }) => item
      );

      const stepDef = newFlow.getStepDefinition('test_map');
      expect(stepDef.options.queue).toBe('specialized_worker');
    });
  });
});
```

#### 3. Compilation Tests

**File**: `pkgs/dsl/__tests__/compilation/map-compilation.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { Flow, compileFlow } from '../../src/index.js';

describe('Map step compilation', () => {
  describe('SQL generation', () => {
    it('should generate correct add_step calls for map steps', () => {
      const flow = new Flow<{ count: number }>({ slug: 'test_flow' })
        .array({ slug: 'items' }, ({ run }) => Array(run.count).fill(0).map((_, i) => i))
        .map({ slug: 'doubled', array: 'items' }, ({ item }) => item * 2);

      const compiled = compileFlow(flow);

      expect(compiled.sql).toContain(
        `SELECT pgflow.add_step('test_flow', 'items', 'single', ARRAY[]::TEXT[], queue => NULL);`
      );
      expect(compiled.sql).toContain(
        `SELECT pgflow.add_step('test_flow', 'doubled', 'map', ARRAY['items'], queue => NULL);`
      );
    });

    it('should handle map steps with runtime options', () => {
      const flow = new Flow<Record<string, never>>({ slug: 'test_flow' })
        .array({ slug: 'data' }, () => [1, 2, 3])
        .map(
          {
            slug: 'processed',
            array: 'data',
            maxAttempts: 5,
            baseDelay: 100,
            timeout: 30,
          },
          ({ item }) => item * 2
        );

      const compiled = compileFlow(flow);

      expect(compiled.sql).toContain(
        `SELECT pgflow.add_step('test_flow', 'processed', 'map', ARRAY['data'], queue => NULL, opt_max_attempts => 5, opt_base_delay => 100, opt_timeout => 30);`
      );
    });

    it('should handle queue parameter in map steps', () => {
      const flow = new Flow<Record<string, never>>({ slug: 'test_flow' })
        .array({ slug: 'tasks' }, () => [1, 2, 3])
        .map(
          {
            slug: 'cpu_intensive',
            array: 'tasks', 
            queue: 'cpu_worker',
          },
          ({ item }) => item ** 2
        );

      const compiled = compileFlow(flow);

      expect(compiled.sql).toContain(
        `SELECT pgflow.add_step('test_flow', 'cpu_intensive', 'map', ARRAY['tasks'], queue => 'cpu_worker');`
      );
    });
  });

  describe('handler compilation', () => {
    it('should generate correct handler functions for map steps', () => {
      const flow = new Flow<{ multiplier: number }>({ slug: 'test_flow' })
        .array({ slug: 'numbers' }, () => [1, 2, 3])
        .map({ slug: 'multiplied', array: 'numbers' }, ({ run, item }) => {
          return item * run.multiplier;
        });

      const compiled = compileFlow(flow);

      // Handler should expect { run, item } input structure
      expect(compiled.handlers['test_flow_multiplied']).toBeDefined();
      expect(compiled.handlers['test_flow_multiplied'].toString()).toContain('run');
      expect(compiled.handlers['test_flow_multiplied'].toString()).toContain('item');
    });

    it('should handle async map handlers', () => {
      const flow = new Flow<{ delay: number }>({ slug: 'test_flow' })
        .array({ slug: 'items' }, () => [1, 2, 3])
        .map({ slug: 'async_processed', array: 'items' }, async ({ run, item }) => {
          await new Promise(resolve => setTimeout(resolve, run.delay));
          return item * 2;
        });

      const compiled = compileFlow(flow);

      expect(compiled.handlers['test_flow_async_processed']).toBeDefined();
      // Should handle Promise return type
      expect(typeof compiled.handlers['test_flow_async_processed']).toBe('function');
    });
  });

  describe('complex compilation scenarios', () => {
    it('should handle chains of map steps', () => {
      const flow = new Flow<{ base: number }>({ slug: 'test_flow' })
        .array({ slug: 'initial' }, ({ run }) => [run.base, run.base + 1])
        .map({ slug: 'doubled', array: 'initial' }, ({ item }) => item * 2)
        .map({ slug: 'squared', array: 'doubled' }, ({ item }) => item * item);

      const compiled = compileFlow(flow);

      expect(compiled.sql).toContain(
        `SELECT pgflow.add_step('test_flow', 'doubled', 'map', ARRAY['initial'], queue => NULL);`
      );
      expect(compiled.sql).toContain(
        `SELECT pgflow.add_step('test_flow', 'squared', 'map', ARRAY['doubled'], queue => NULL);`
      );
    });

    it('should handle mixed step types in complex flows', () => {
      const flow = new Flow<{ count: number }>({ slug: 'mixed_flow' })
        .step({ slug: 'config' }, ({ run }) => ({ size: run.count * 2 }))
        .array({ slug: 'items', dependsOn: ['config'] }, ({ config }) => 
          Array(config.size).fill(0).map((_, i) => i)
        )
        .map({ slug: 'processed', array: 'items' }, ({ item }) => item * 10)
        .step({ slug: 'summary', dependsOn: ['processed'] }, ({ processed }) => ({
          count: processed.length,
          sum: processed.reduce((a, b) => a + b, 0)
        }));

      const compiled = compileFlow(flow);

      // Should generate correct step types
      expect(compiled.sql).toContain(`'single', ARRAY[]::TEXT[]`); // config step
      expect(compiled.sql).toContain(`'single', ARRAY['config']`); // items step
      expect(compiled.sql).toContain(`'map', ARRAY['items']`); // processed step  
      expect(compiled.sql).toContain(`'single', ARRAY['processed']`); // summary step
    });
  });
});
```

## Implementation Timeline

### Day 1: Type System Foundation
- **Morning**: Design and implement type definitions
  - `ArrayElementType<T>` utility type
  - `MapStepDefinition` interface
  - Enhanced `StepRuntimeOptions` with queue support
- **Afternoon**: Implement `.map()` method signature
  - Generic constraints and type inference
  - Input/output type construction
  - Type validation tests

### Day 2: Method Implementation
- **Morning**: Implement `.map()` method logic
  - Step validation and creation
  - Dependency management
  - Integration with existing Flow class
- **Afternoon**: Runtime behavior testing  
  - Basic functionality tests
  - Validation and error handling tests
  - Integration with Phase 1 `.array()` method

### Day 3: Compilation Implementation
- **Morning**: Update `compileFlow` for map steps
  - SQL generation for map step creation
  - Runtime options compilation
  - Handler compilation with `item` parameter
- **Afternoon**: Compilation testing
  - SQL generation validation
  - Handler compilation verification
  - Complex scenario testing

### Day 4: Integration Testing
- **Morning**: End-to-end integration tests
  - Array → map → regular step chains
  - Complex multi-level scenarios
  - Mixed step type workflows
- **Afternoon**: Type inference validation
  - Complex nested type scenarios
  - Edge case type handling
  - Developer experience testing

### Day 5: Polish and Validation
- **Morning**: Performance validation
  - Large array type inference performance
  - Compilation speed with complex flows
  - Memory usage validation
- **Afternoon**: Documentation and examples
  - JSDoc documentation
  - Usage examples
  - Integration guide for Phase 2c

## Success Criteria

### Functional Requirements
1. ✅ **Map Method Available**: `.map()` method added to Flow class
2. ✅ **Type Inference Working**: Correct element type extraction from arrays
3. ✅ **Compilation Support**: Map steps compile to correct SQL
4. ✅ **Runtime Options**: All step options work with map steps
5. ✅ **Queue Infrastructure**: Queue parameter stored (unused until Phase 3)

### Type Safety Requirements  
1. ✅ **Compile-time Validation**: Invalid array dependencies rejected
2. ✅ **Element Type Inference**: Handler gets correctly typed `item` parameter
3. ✅ **Output Type Inference**: Map outputs correctly typed as arrays
4. ✅ **Dependency Chaining**: Map-to-map dependencies work correctly

### Integration Requirements
1. ✅ **Phase 1 Compatibility**: Works with existing `.array()` method
2. ✅ **Phase 2a Compatibility**: Compiles to Phase 2a SQL infrastructure  
3. ✅ **Existing DSL Patterns**: Follows established patterns and conventions
4. ✅ **Backwards Compatibility**: No breaking changes to existing code

### Testing Requirements
1. ✅ **Comprehensive Type Tests**: All type scenarios covered
2. ✅ **Runtime Test Coverage**: All method behaviors tested
3. ✅ **Compilation Tests**: SQL generation validated
4. ✅ **Integration Tests**: End-to-end workflows verified

## Risk Mitigation

### Identified Risks

**Risk 1: Type Inference Complexity**
- **Mitigation**: Use proven patterns from Phase 1, comprehensive type tests
- **Testing**: Complex nested type scenarios, edge case validation
- **Fallback**: Simplify type constraints if performance issues arise

**Risk 2: Compilation Correctness**
- **Mitigation**: Thorough SQL generation testing, Phase 2a integration validation
- **Testing**: Comparison with expected SQL, end-to-end compilation tests
- **Validation**: Manual verification of generated SQL against Phase 2a functions

**Risk 3: Developer Experience Issues**
- **Mitigation**: Extensive testing of error messages and IDE experience
- **Testing**: Invalid usage scenarios, helpful error message validation
- **Iteration**: Continuous refinement based on usage patterns

### Rollback Strategy

**DSL Rollback**: Remove `.map()` method and associated types
**Compilation Rollback**: Revert `compileFlow` to Phase 1 version  
**Testing Rollback**: Archive map-specific tests for future use

## Phase 2c Preparation

This Phase 2b implementation provides the complete DSL layer for Phase 2c:

**Ready for Worker Integration**:
- Map steps compile to Phase 2a SQL infrastructure
- Handler functions properly structured for worker execution
- Type system validated and developer-ready

**Phase 2c Dependencies Met**:
- Map handlers expect `{ run, item }` input structure
- Compilation generates Phase 2a-compatible SQL
- All DSL patterns established and tested
- Queue infrastructure ready (unused until Phase 3)

The DSL layer is now ready for worker-side execution and end-to-end integration testing in Phase 2c.

<function_calls>
<invoke name="TodoWrite">
<parameter name="todos">[{"content": "Research existing test patterns and invariants from other plans", "status": "completed", "activeForm": "Researching existing test patterns and invariants from other plans"}, {"content": "Examine Phase 1 array() implementation and tests", "status": "completed", "activeForm": "Examining Phase 1 array() implementation and tests"}, {"content": "Research SQL test utilities in seed.sql", "status": "completed", "activeForm": "Researching SQL test utilities in seed.sql"}, {"content": "Create Phase 2a plan (Map Infrastructure)", "status": "completed", "activeForm": "Creating Phase 2a plan (Map Infrastructure)"}, {"content": "Create Phase 2b plan (DSL and Compilation)", "status": "completed", "activeForm": "Creating Phase 2b plan (DSL and Compilation)"}, {"content": "Create Phase 2c plan (Worker and Integration)", "status": "in_progress", "activeForm": "Creating Phase 2c plan (Worker and Integration)"}]