import { Flow, type StepInput, type ExtractFlowContext } from '../../src/index.js';
import { describe, it, expectTypeOf } from 'vitest';

describe('.array() method type constraints', () => {
  describe('return type enforcement', () => {
    it('should accept handlers that return arrays', () => {
      new Flow<Record<string, never>>({ slug: 'test' })
        .array({ slug: 'numbers' }, () => [1, 2, 3])
        .array({ slug: 'objects' }, () => [{ id: 1 }, { id: 2 }])
        .array({ slug: 'strings' }, () => ['a', 'b', 'c'])
        .array({ slug: 'empty' }, () => [])
        .array({ slug: 'nested' }, () => [[1, 2], [3, 4]]);
    });

    it('should accept handlers that return Promise<Array>', () => {
      new Flow<Record<string, never>>({ slug: 'test' })
        .array({ slug: 'async_numbers' }, async () => [1, 2, 3])
        .array({ slug: 'async_objects' }, async () => [{ id: 1 }])
        .array({ slug: 'async_empty' }, async () => []);
    });

    it('should reject handlers that return non-arrays', () => {
      new Flow<Record<string, never>>({ slug: 'test2' })
        // @ts-expect-error - should reject number return
        .array({ slug: 'invalid_number' }, () => 42)
        // @ts-expect-error - should reject string return
        .array({ slug: 'invalid_string' }, () => 'not an array')
        // @ts-expect-error - should reject object return
        .array({ slug: 'invalid_object' }, () => ({ not: 'array' }))
        // @ts-expect-error - should reject null return
        .array({ slug: 'invalid_null' }, () => null)
        // @ts-expect-error - should reject undefined return
        .array({ slug: 'invalid_undefined' }, () => undefined);
    });

    it('should reject handlers that return Promise<non-array>', () => {
      new Flow<Record<string, never>>({ slug: 'test' })
        // @ts-expect-error - should reject Promise<number>
        .array({ slug: 'invalid_async_number' }, async () => 42)
        // @ts-expect-error - should reject Promise<string>
        .array({ slug: 'invalid_async_string' }, async () => 'not array')
        // @ts-expect-error - should reject Promise<null>
        .array({ slug: 'invalid_async_null' }, async () => null);
    });
  });

  describe('type inference', () => {
    it('should provide correct input types for dependent steps', () => {
      new Flow<{ count: number }>({ slug: 'test' })
        .array({ slug: 'items' }, (flowInput) => Array(flowInput.count).fill(0).map((_, i) => i))
        .step({ slug: 'process', dependsOn: ['items'] }, (deps) => {
          expectTypeOf(deps).toMatchTypeOf<{
            items: number[];
          }>();
          return deps.items.length;
        });
    });

    it('should correctly infer element types from arrays', () => {
      new Flow<{ userId: string }>({ slug: 'test' })
        .array({ slug: 'users' }, () => [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }])
        .step({ slug: 'count_users', dependsOn: ['users'] }, (deps) => {
          expectTypeOf(deps.users).toEqualTypeOf<{ id: number; name: string }[]>();
          expectTypeOf(deps.users[0]).toMatchTypeOf<{ id: number; name: string }>();
          return deps.users.length;
        });
    });

    it('should handle complex nested array types', () => {
      new Flow<{ depth: number }>({ slug: 'test' })
        .array({ slug: 'matrix' }, (flowInput) =>
          Array(flowInput.depth).fill(0).map(() => Array(3).fill(0).map(() => ({ value: Math.random() })))
        )
        .step({ slug: 'flatten', dependsOn: ['matrix'] }, (deps) => {
          expectTypeOf(deps.matrix).toEqualTypeOf<{ value: number }[][]>();
          expectTypeOf(deps.matrix[0]).toEqualTypeOf<{ value: number }[]>();
          expectTypeOf(deps.matrix[0][0]).toMatchTypeOf<{ value: number }>();
          return deps.matrix.flat();
        });
    });

    it('should correctly type async array handlers', () => {
      new Flow<{ url: string }>({ slug: 'test' })
        .array({ slug: 'data' }, async (flowInput) => {
          // Simulate async data fetching
          await new Promise(resolve => setTimeout(resolve, 1));
          return [{ url: flowInput.url, status: 200 }];
        })
        .step({ slug: 'validate', dependsOn: ['data'] }, (deps) => {
          expectTypeOf(deps.data).toEqualTypeOf<{ url: string; status: number }[]>();
          return deps.data.every(item => item.status === 200);
        });
    });
  });

  describe('dependency validation', () => {
    it('should enforce compile-time dependency validation', () => {
      new Flow<string>({ slug: 'test' })
        .array({ slug: 'items' }, () => [1, 2, 3])
        // @ts-expect-error - should reject non-existent dependency
        .array({ slug: 'invalid', dependsOn: ['nonExistentStep'] }, () => []);
    });

    it('should not allow access to non-dependencies', () => {
      new Flow<string>({ slug: 'test' })
        .array({ slug: 'items1' }, () => [1, 2, 3])
        .array({ slug: 'items2' }, () => ['a', 'b', 'c'])
        .array({ slug: 'combined', dependsOn: ['items1'] }, (deps) => {
          expectTypeOf(deps).toMatchTypeOf<{
            items1: number[];
          }>();

          // Verify that items2 is not accessible
          expectTypeOf(deps).not.toHaveProperty('items2');

          return deps.items1.map(String);
        });
    });

    it('should correctly type multi-dependency array steps', () => {
      new Flow<{ base: number }>({ slug: 'test' })
        .array({ slug: 'numbers' }, (flowInput) => [flowInput.base, flowInput.base + 1])
        .array({ slug: 'letters' }, () => ['a', 'b'])
        .array({ slug: 'combined', dependsOn: ['numbers', 'letters'] }, (deps) => {
          expectTypeOf(deps).toMatchTypeOf<{
            numbers: number[];
            letters: string[];
          }>();

          return deps.numbers.map((num, i) => ({
            number: num,
            letter: deps.letters[i] || 'z'
          }));
        });
    });
  });

  describe('context typing', () => {
    it('should provide custom context via Flow type parameter', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flow = new Flow<{ id: number }, { api: { get: (id: number) => Promise<any> } }>({ slug: 'test' })
        .array({ slug: 'fetch_data' }, (flowInput, context) => {
          // No handler annotation needed! Type parameter provides context
          expectTypeOf(context.api).toEqualTypeOf<{ get: (id: number) => Promise<any> }>();
          expectTypeOf(context.env).toEqualTypeOf<Record<string, string | undefined>>();
          expectTypeOf(context.shutdownSignal).toEqualTypeOf<AbortSignal>();

          return [{ id: flowInput.id, data: 'mock' }];
        });

      // ExtractFlowContext should include FlowContext & custom resources
      type FlowCtx = ExtractFlowContext<typeof flow>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expectTypeOf<FlowCtx>().toMatchTypeOf<{
        env: Record<string, string | undefined>;
        shutdownSignal: AbortSignal;
        stepTask: { run_id: string };
        api: { get: (id: number) => Promise<any> };
      }>();
    });

    it('should share custom context across array and regular steps', () => {
      const flow = new Flow<{ count: number }, { generator: () => number; processor: (items: number[]) => string }>({ slug: 'test' })
        .array({ slug: 'items' }, (flowInput, context) => {
          // All steps get the same context automatically
          return Array(flowInput.count).fill(0).map(() => context.generator());
        })
        .step({ slug: 'process' }, (flowInput, context) => {
          return context.processor([1, 2, 3]);
        });

      // ExtractFlowContext returns FlowContext & all custom resources
      type FlowCtx = ExtractFlowContext<typeof flow>;
      expectTypeOf<FlowCtx>().toMatchTypeOf<{
        env: Record<string, string | undefined>;
        shutdownSignal: AbortSignal;
        stepTask: { run_id: string };
        generator: () => number;
        processor: (items: number[]) => string;
      }>();
    });
  });

  describe('handler signature validation', () => {
    it('should correctly type array step handlers when using getStepDefinition', () => {
      const flow = new Flow<{ size: number }>({ slug: 'test' })
        .array({ slug: 'data' }, (flowInput, _context) => Array(flowInput.size).fill(0).map((_, i) => ({ index: i })))
        .step({ slug: 'dependent', dependsOn: ['data'] }, (deps, _context) => deps.data.length);

      const arrayStep = flow.getStepDefinition('data');

      // Test array step handler type - root steps receive flowInput directly (no run key)
      expectTypeOf(arrayStep.handler).toBeFunction();
      expectTypeOf(arrayStep.handler).parameter(0).toMatchTypeOf<{ size: number }>();
      expectTypeOf(arrayStep.handler).returns.toMatchTypeOf<
        { index: number }[] | Promise<{ index: number }[]>
      >();

      const dependentStep = flow.getStepDefinition('dependent');
      // Dependent steps receive deps only (no run key)
      expectTypeOf(dependentStep.handler).parameter(0).toMatchTypeOf<{
        data: { index: number }[];
      }>();
    });
  });

  describe('StepInput utility type compatibility', () => {
    it('should work correctly with StepInput utility type', () => {
      const flow = new Flow<{ userId: string }>({ slug: 'test' })
        .array({ slug: 'items' }, () => [{ id: 1 }, { id: 2 }])
        .array({ slug: 'processed', dependsOn: ['items'] }, () => ['a', 'b']);

      // Test StepInput type extraction - root steps get flow input directly
      type ItemsInput = StepInput<typeof flow, 'items'>;
      expectTypeOf<ItemsInput>().toMatchTypeOf<{
        userId: string;
      }>();

      // Dependent steps get deps only (no run key)
      type ProcessedInput = StepInput<typeof flow, 'processed'>;
      expectTypeOf<ProcessedInput>().toMatchTypeOf<{
        items: { id: number }[];
      }>();

      // Should not contain non-dependencies
      expectTypeOf<ProcessedInput>().not.toHaveProperty('nonExistent');
    });
  });
});
