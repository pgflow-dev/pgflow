import { Flow, type Json, type StepInput, type ExtractFlowContext } from '../../src/index.js';
import { describe, it, expectTypeOf } from 'vitest';

describe('.map() method type constraints', () => {
  describe('root map - flow input is array', () => {
    it('should accept root map when flow input is array', () => {
      const flow = new Flow<string[]>({ slug: 'test' })
        .map({ slug: 'process' }, (item) => {
          expectTypeOf(item).toEqualTypeOf<string>();
          return { processed: item.toUpperCase() };
        });

      // The map step should return an array of the handler return type
      type ProcessOutput = typeof flow extends Flow<any, any, infer Steps, any>
        ? Steps['process']
        : never;
      expectTypeOf<ProcessOutput>().toEqualTypeOf<{ processed: string }[]>();
    });

    it('should reject root map when flow input is not array', () => {
      new Flow<string>({ slug: 'test' })
        // @ts-expect-error - Flow input must be array for root map
        .map({ slug: 'fail' }, (item) => item);

      new Flow<{ name: string }>({ slug: 'test' })
        // @ts-expect-error - Object is not an array
        .map({ slug: 'fail2' }, (item) => item);
    });

    it('should correctly type item for nested array input', () => {
      const flow = new Flow<number[][]>({ slug: 'test' })
        .map({ slug: 'flatten' }, (item) => {
          expectTypeOf(item).toEqualTypeOf<number[]>();
          return item.length;
        });

      type FlattenOutput = typeof flow extends Flow<any, any, infer Steps, any>
        ? Steps['flatten']
        : never;
      expectTypeOf<FlattenOutput>().toEqualTypeOf<number[]>();
    });

    it('should work with Json array types', () => {
      const flow = new Flow<Json[]>({ slug: 'test' })
        .map({ slug: 'stringify' }, (item) => {
          expectTypeOf(item).toEqualTypeOf<Json>();
          return String(item);
        });

      type StringifyOutput = typeof flow extends Flow<any, any, infer Steps, any>
        ? Steps['stringify']
        : never;
      expectTypeOf<StringifyOutput>().toEqualTypeOf<string[]>();
    });
  });

  describe('dependent map - array from another step', () => {
    it('should accept dependent map when dependency returns array', () => {
      const flow = new Flow<{ count: number }>({ slug: 'test' })
        .array({ slug: 'numbers' }, (flowInput) =>
          Array(flowInput.count).fill(0).map((_, i) => i)
        )
        .map({ slug: 'double', array: 'numbers' }, (item) => {
          expectTypeOf(item).toEqualTypeOf<number>();
          return item * 2;
        });

      type DoubleOutput = typeof flow extends Flow<any, any, infer Steps, any>
        ? Steps['double']
        : never;
      expectTypeOf<DoubleOutput>().toEqualTypeOf<number[]>();
    });

    it('should reject dependent map when dependency returns non-array', () => {
      const flow = new Flow<Record<string, never>>({ slug: 'test' })
        .step({ slug: 'notArray' }, () => 'string');

      // @ts-expect-error - dependency must return array
      flow.map({ slug: 'fail', array: 'notArray' }, (item) => item);
    });

    it('should reject non-existent dependencies', () => {
      const flow = new Flow<Record<string, never>>({ slug: 'test' })
        .array({ slug: 'items' }, () => [1, 2, 3]);

      // This test verifies TypeScript compile-time checking
      // The @ts-expect-error comment verifies the type error
      // We wrap in try-catch to handle runtime validation
      try {
        // @ts-expect-error - 'nonExistent' is not a valid step
        flow.map({ slug: 'fail', array: 'nonExistent' }, (item) => item);
      } catch (error) {
        // Runtime validation also catches this - expected behavior
      }
    });

    it('should handle complex object arrays', () => {
      const flow = new Flow<Record<string, never>>({ slug: 'test' })
        .step({ slug: 'fetch' }, () => [
          { id: 1, name: 'Alice', age: 30 },
          { id: 2, name: 'Bob', age: 25 }
        ])
        .map({ slug: 'extractNames', array: 'fetch' }, (user) => {
          expectTypeOf(user).toEqualTypeOf<{ id: number; name: string; age: number }>();
          return user.name;
        });

      type NamesOutput = typeof flow extends Flow<any, any, infer Steps, any>
        ? Steps['extractNames']
        : never;
      expectTypeOf<NamesOutput>().toEqualTypeOf<string[]>();
    });
  });

  describe('handler return type enforcement', () => {
    it('should enforce Json return type', () => {
      new Flow<string[]>({ slug: 'test' })
        .map({ slug: 'valid1' }, () => 'string')
        .map({ slug: 'valid2' }, () => 123)
        .map({ slug: 'valid3' }, () => true)
        .map({ slug: 'valid4' }, () => null)
        .map({ slug: 'valid5' }, () => ({ key: 'value' }))
        .map({ slug: 'valid6' }, () => [1, 2, 3]);

      // These should fail type checking
      new Flow<string[]>({ slug: 'test' })
        // @ts-expect-error - undefined is not Json
        .map({ slug: 'invalid1' }, () => undefined)
        // @ts-expect-error - symbol is not Json
        .map({ slug: 'invalid2' }, () => Symbol('test'))
        // @ts-expect-error - function is not Json
        .map({ slug: 'invalid3' }, () => (() => 'function'));
    });

    it('should handle async handlers returning Json', () => {
      new Flow<number[]>({ slug: 'test' })
        .map({ slug: 'async1' }, async (n) => n * 2)
        .map({ slug: 'async2' }, async (n) => ({ value: n }))
        .map({ slug: 'async3' }, async (n) => `number: ${n}`);
    });
  });

  describe('map chaining', () => {
    it('should allow map to map chaining', () => {
      const flow = new Flow<string[]>({ slug: 'test' })
        .map({ slug: 'uppercase' }, (item) => item.toUpperCase())
        .map({ slug: 'lengths', array: 'uppercase' }, (item) => {
          expectTypeOf(item).toEqualTypeOf<string>();
          return item.length;
        });

      type LengthsOutput = typeof flow extends Flow<any, any, infer Steps, any>
        ? Steps['lengths']
        : never;
      expectTypeOf<LengthsOutput>().toEqualTypeOf<number[]>();
    });

    it('should allow regular step to depend on map output', () => {
      const flow = new Flow<number[]>({ slug: 'test' })
        .map({ slug: 'double' }, (n) => n * 2)
        .step({ slug: 'sum', dependsOn: ['double'] }, (deps) => {
          expectTypeOf(deps.double).toEqualTypeOf<number[]>();
          return deps.double.reduce((a, b) => a + b, 0);
        });

      type SumOutput = typeof flow extends Flow<any, any, infer Steps, any>
        ? Steps['sum']
        : never;
      expectTypeOf<SumOutput>().toEqualTypeOf<number>();
    });
  });

  describe('context inference', () => {
    it('should preserve context through map methods', () => {
      const flow = new Flow<string[]>({ slug: 'test' })
        .map({ slug: 'process' }, (item, context) => {
          // Let TypeScript infer the full context type
          expectTypeOf(context.env).toEqualTypeOf<Record<string, string | undefined>>();
          expectTypeOf(context.shutdownSignal).toEqualTypeOf<AbortSignal>();
          // Context should include flowInput as Promise for map steps
          expectTypeOf(context.flowInput).toEqualTypeOf<Promise<string[]>>();
          return String(item);
        });

      type FlowContext = ExtractFlowContext<typeof flow>;
      expectTypeOf<FlowContext>().toMatchTypeOf<{
        env: Record<string, string | undefined>;
        shutdownSignal: AbortSignal;
      }>();
    });
  });

  describe('StepInput utility type', () => {
    it('should not include input for map steps', () => {
      const flow = new Flow<string[]>({ slug: 'test' })
        .map({ slug: 'process' }, (item) => item.toUpperCase())
        .step({ slug: 'count', dependsOn: ['process'] }, (deps) => deps.process.length);

      // Map steps don't have StepInput in the traditional sense
      // They receive individual items, not the full input object
      // Root map step gets flow input directly (no run key)
      type ProcessInput = StepInput<typeof flow, 'process'>;
      expectTypeOf<ProcessInput>().toMatchTypeOf<string[]>();

      // Dependent step gets deps only (no run key)
      type CountInput = StepInput<typeof flow, 'count'>;
      expectTypeOf<CountInput>().toMatchTypeOf<{
        process: string[];
      }>();
    });
  });

  describe('getStepDefinition compatibility', () => {
    it('should correctly type map step definitions', () => {
      const flow = new Flow<number[]>({ slug: 'test' })
        .map({ slug: 'square' }, (n) => n * n)
        .step({ slug: 'sum', dependsOn: ['square'] }, (deps) =>
          deps.square.reduce((a, b) => a + b, 0)
        );

      const squareStep = flow.getStepDefinition('square');
      // Handler should be typed to receive individual items
      expectTypeOf(squareStep.handler).toBeFunction();

      const sumStep = flow.getStepDefinition('sum');
      // Handler should be typed to receive deps only (no run key)
      expectTypeOf(sumStep.handler).toBeFunction();
      expectTypeOf(sumStep.handler).parameter(0).toEqualTypeOf<{
        square: number[];
      }>();
    });
  });

  describe('edge cases', () => {
    it('should handle union types in arrays', () => {
      const flow = new Flow<(string | number)[]>({ slug: 'test' })
        .map({ slug: 'stringify' }, (item) => {
          expectTypeOf(item).toEqualTypeOf<string | number>();
          return String(item);
        });

      type StringifyOutput = typeof flow extends Flow<any, any, infer Steps, any>
        ? Steps['stringify']
        : never;
      expectTypeOf<StringifyOutput>().toEqualTypeOf<string[]>();
    });

    it('should handle nullable array elements', () => {
      const flow = new Flow<(string | null)[]>({ slug: 'test' })
        .map({ slug: 'filter' }, (item) => {
          expectTypeOf(item).toEqualTypeOf<string | null>();
          return item !== null;
        });

      type FilterOutput = typeof flow extends Flow<any, any, infer Steps, any>
        ? Steps['filter']
        : never;
      expectTypeOf<FilterOutput>().toEqualTypeOf<boolean[]>();
    });
  });
});
