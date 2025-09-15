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
      new Flow<Record<string, never>>({ slug: 'test' })
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
        .array({ slug: 'items' }, ({ run }) => Array(run.count).fill(0).map((_, i) => i))
        .step({ slug: 'process', dependsOn: ['items'] }, (input) => {
          expectTypeOf(input).toMatchTypeOf<{
            run: { count: number };
            items: number[];
          }>();
          return input.items.length;
        });
    });

    it('should correctly infer element types from arrays', () => {
      new Flow<{ userId: string }>({ slug: 'test' })
        .array({ slug: 'users' }, () => [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }])
        .step({ slug: 'count_users', dependsOn: ['users'] }, (input) => {
          expectTypeOf(input.users).toEqualTypeOf<{ id: number; name: string }[]>();
          expectTypeOf(input.users[0]).toMatchTypeOf<{ id: number; name: string }>();
          return input.users.length;
        });
    });

    it('should handle complex nested array types', () => {
      new Flow<{ depth: number }>({ slug: 'test' })
        .array({ slug: 'matrix' }, ({ run }) => 
          Array(run.depth).fill(0).map(() => Array(3).fill(0).map(() => ({ value: Math.random() })))
        )
        .step({ slug: 'flatten', dependsOn: ['matrix'] }, (input) => {
          expectTypeOf(input.matrix).toEqualTypeOf<{ value: number }[][]>();
          expectTypeOf(input.matrix[0]).toEqualTypeOf<{ value: number }[]>();
          expectTypeOf(input.matrix[0][0]).toMatchTypeOf<{ value: number }>();
          return input.matrix.flat();
        });
    });

    it('should correctly type async array handlers', () => {
      new Flow<{ url: string }>({ slug: 'test' })
        .array({ slug: 'data' }, async ({ run }) => {
          // Simulate async data fetching
          await new Promise(resolve => setTimeout(resolve, 1));
          return [{ url: run.url, status: 200 }];
        })
        .step({ slug: 'validate', dependsOn: ['data'] }, (input) => {
          expectTypeOf(input.data).toEqualTypeOf<{ url: string; status: number }[]>();
          return input.data.every(item => item.status === 200);
        });
    });
  });

  describe('dependency validation', () => {
    it('should enforce compile-time dependency validation', () => {
      const testFlow = new Flow<string>({ slug: 'test' })
        .array({ slug: 'items' }, () => [1, 2, 3]);

      // Type assertion to verify compile-time error
      type TestType = Parameters<typeof testFlow.array>[0]['dependsOn'];
      // @ts-expect-error - should only allow 'items' as a valid dependency
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const invalidDeps: TestType = ['nonExistentStep'];
    });

    it('should not allow access to non-dependencies', () => {
      new Flow<string>({ slug: 'test' })
        .array({ slug: 'items1' }, () => [1, 2, 3])
        .array({ slug: 'items2' }, () => ['a', 'b', 'c'])
        .array({ slug: 'combined', dependsOn: ['items1'] }, (input) => {
          expectTypeOf(input).toMatchTypeOf<{
            run: string;
            items1: number[];
          }>();

          // Verify that items2 is not accessible
          expectTypeOf(input).not.toHaveProperty('items2');

          return input.items1.map(String);
        });
    });

    it('should correctly type multi-dependency array steps', () => {
      new Flow<{ base: number }>({ slug: 'test' })
        .array({ slug: 'numbers' }, ({ run }) => [run.base, run.base + 1])
        .array({ slug: 'letters' }, () => ['a', 'b'])
        .array({ slug: 'combined', dependsOn: ['numbers', 'letters'] }, (input) => {
          expectTypeOf(input).toMatchTypeOf<{
            run: { base: number };
            numbers: number[];
            letters: string[];
          }>();
          
          return input.numbers.map((num, i) => ({
            number: num,
            letter: input.letters[i] || 'z'
          }));
        });
    });
  });

  describe('context inference', () => {
    it('should preserve context inference for array methods', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flow = new Flow<{ id: number }>({ slug: 'test' })
        .array({ slug: 'fetch_data' }, (input, context: { api: { get: (id: number) => Promise<any> } }) => {
          expectTypeOf(context.api).toEqualTypeOf<{ get: (id: number) => Promise<any> }>();
          expectTypeOf(context.env).toEqualTypeOf<Record<string, string | undefined>>();
          expectTypeOf(context.shutdownSignal).toEqualTypeOf<AbortSignal>();
          
          return [{ id: input.run.id, data: 'mock' }];
        });

      // ExtractFlowContext should include the api context
      type FlowContext = ExtractFlowContext<typeof flow>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expectTypeOf<FlowContext>().toMatchTypeOf<{
        env: Record<string, string | undefined>;
        shutdownSignal: AbortSignal;
        api: { get: (id: number) => Promise<any> };
      }>();
    });

    it('should accumulate context across array and regular steps', () => {
      const flow = new Flow<{ count: number }>({ slug: 'test' })
        .array({ slug: 'items' }, (input, context: { generator: () => number }) => {
          return Array(input.run.count).fill(0).map(() => context.generator());
        })
        .step({ slug: 'process' }, (input, context: { processor: (items: number[]) => string }) => {
          return context.processor([1, 2, 3]);
        });

      type FlowContext = ExtractFlowContext<typeof flow>;
      expectTypeOf<FlowContext>().toMatchTypeOf<{
        env: Record<string, string | undefined>;
        shutdownSignal: AbortSignal;
        generator: () => number;
        processor: (items: number[]) => string;
      }>();
    });
  });

  describe('handler signature validation', () => {
    it('should correctly type array step handlers when using getStepDefinition', () => {
      const flow = new Flow<{ size: number }>({ slug: 'test' })
        .array({ slug: 'data' }, (input) => Array(input.run.size).fill(0).map((_, i) => ({ index: i })))
        .step({ slug: 'dependent', dependsOn: ['data'] }, (input) => input.data.length);

      const arrayStep = flow.getStepDefinition('data');
      
      // Test array step handler type
      expectTypeOf(arrayStep.handler).toBeFunction();
      expectTypeOf(arrayStep.handler).parameters.toMatchTypeOf<[{ run: { size: number } }]>();
      expectTypeOf(arrayStep.handler).returns.toMatchTypeOf<
        { index: number }[] | Promise<{ index: number }[]>
      >();

      const dependentStep = flow.getStepDefinition('dependent');
      expectTypeOf(dependentStep.handler).parameters.toMatchTypeOf<[{
        run: { size: number };
        data: { index: number }[];
      }]>();
    });
  });

  describe('StepInput utility type compatibility', () => {
    it('should work correctly with StepInput utility type', () => {
      const flow = new Flow<{ userId: string }>({ slug: 'test' })
        .array({ slug: 'items' }, () => [{ id: 1 }, { id: 2 }])
        .array({ slug: 'processed', dependsOn: ['items'] }, () => ['a', 'b']);

      // Test StepInput type extraction
      type ItemsInput = StepInput<typeof flow, 'items'>;
      expectTypeOf<ItemsInput>().toMatchTypeOf<{
        run: { userId: string };
      }>();

      type ProcessedInput = StepInput<typeof flow, 'processed'>;
      expectTypeOf<ProcessedInput>().toMatchTypeOf<{
        run: { userId: string };
        items: { id: number }[];
      }>();

      // Should not contain non-dependencies
      expectTypeOf<ProcessedInput>().not.toHaveProperty('nonExistent');
    });
  });
});