import { Flow, type StepInput, type StepOutput } from '../../src/index.js';
import { describe, it, expectTypeOf } from 'vitest';

/**
 * Type tests for skippable step dependencies
 *
 * When a step has `else: 'skip' | 'skip-cascade'` or `retriesExhausted: 'skip' | 'skip-cascade'`,
 * it may not execute. Dependent steps should receive that step's output as an optional key.
 */

describe('skippable deps type safety', () => {
  describe('core skippability - else', () => {
    it('step with else: skip makes output optional for dependents', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test' })
        .step(
          { slug: 'conditional', if: { value: 42 }, else: 'skip' },
          (input) => ({ result: input.value * 2 })
        )
        .step({ slug: 'dependent', dependsOn: ['conditional'] }, (deps) => {
          // conditional should be optional - can't access without null check
          expectTypeOf(deps.conditional).toEqualTypeOf<
            { result: number } | undefined
          >();
          return { done: true };
        });

      type DepInput = StepInput<typeof flow, 'dependent'>;
      expectTypeOf<DepInput>().toEqualTypeOf<{
        conditional?: { result: number };
      }>();
    });

    it('step with else: skip-cascade makes output optional for dependents', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test' })
        .step(
          { slug: 'conditional', if: { value: 42 }, else: 'skip-cascade' },
          (input) => ({ result: input.value * 2 })
        )
        .step({ slug: 'dependent', dependsOn: ['conditional'] }, (deps) => {
          expectTypeOf(deps.conditional).toEqualTypeOf<
            { result: number } | undefined
          >();
          return { done: true };
        });

      type DepInput = StepInput<typeof flow, 'dependent'>;
      expectTypeOf<DepInput>().toEqualTypeOf<{
        conditional?: { result: number };
      }>();
    });

    it('step with else: fail keeps output required (default behavior)', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test' })
        .step(
          { slug: 'conditional', if: { value: 42 }, else: 'fail' },
          (input) => ({ result: input.value * 2 })
        )
        .step({ slug: 'dependent', dependsOn: ['conditional'] }, (deps) => {
          // else: 'fail' means step either runs or flow fails - output is guaranteed
          expectTypeOf(deps.conditional).toEqualTypeOf<{ result: number }>();
          return { done: true };
        });

      type DepInput = StepInput<typeof flow, 'dependent'>;
      expectTypeOf<DepInput>().toEqualTypeOf<{
        conditional: { result: number };
      }>();
    });

    it('step without else keeps output required', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test' })
        .step({ slug: 'normal' }, (input) => ({ result: input.value * 2 }))
        .step({ slug: 'dependent', dependsOn: ['normal'] }, (deps) => {
          expectTypeOf(deps.normal).toEqualTypeOf<{ result: number }>();
          return { done: true };
        });

      type DepInput = StepInput<typeof flow, 'dependent'>;
      expectTypeOf<DepInput>().toEqualTypeOf<{
        normal: { result: number };
      }>();
    });
  });

  describe('core skippability - retriesExhausted', () => {
    it('step with retriesExhausted: skip makes output optional for dependents', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test' })
        .step({ slug: 'risky', retriesExhausted: 'skip' }, (input) => ({
          result: input.value * 2,
        }))
        .step({ slug: 'dependent', dependsOn: ['risky'] }, (deps) => {
          expectTypeOf(deps.risky).toEqualTypeOf<
            { result: number } | undefined
          >();
          return { done: true };
        });

      type DepInput = StepInput<typeof flow, 'dependent'>;
      expectTypeOf<DepInput>().toEqualTypeOf<{
        risky?: { result: number };
      }>();
    });

    it('step with retriesExhausted: skip-cascade makes output optional for dependents', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test' })
        .step({ slug: 'risky', retriesExhausted: 'skip-cascade' }, (input) => ({
          result: input.value * 2,
        }))
        .step({ slug: 'dependent', dependsOn: ['risky'] }, (deps) => {
          expectTypeOf(deps.risky).toEqualTypeOf<
            { result: number } | undefined
          >();
          return { done: true };
        });

      type DepInput = StepInput<typeof flow, 'dependent'>;
      expectTypeOf<DepInput>().toEqualTypeOf<{
        risky?: { result: number };
      }>();
    });

    it('step with retriesExhausted: fail keeps output required', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test' })
        .step({ slug: 'risky', retriesExhausted: 'fail' }, (input) => ({
          result: input.value * 2,
        }))
        .step({ slug: 'dependent', dependsOn: ['risky'] }, (deps) => {
          expectTypeOf(deps.risky).toEqualTypeOf<{ result: number }>();
          return { done: true };
        });

      type DepInput = StepInput<typeof flow, 'dependent'>;
      expectTypeOf<DepInput>().toEqualTypeOf<{
        risky: { result: number };
      }>();
    });
  });

  describe('multiple dependencies - mixed skippability', () => {
    it('mixed deps: some optional, some required', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test' })
        .step({ slug: 'skippable', if: { value: 42 }, else: 'skip' }, () => ({
          a: 1,
        }))
        .step({ slug: 'required' }, () => ({ b: 2 }))
        .step(
          { slug: 'dependent', dependsOn: ['skippable', 'required'] },
          (deps) => {
            expectTypeOf(deps.skippable).toEqualTypeOf<
              { a: number } | undefined
            >();
            expectTypeOf(deps.required).toEqualTypeOf<{ b: number }>();
            return { done: true };
          }
        );

      type DepInput = StepInput<typeof flow, 'dependent'>;
      expectTypeOf<DepInput>().toEqualTypeOf<{
        skippable?: { a: number };
        required: { b: number };
      }>();
    });

    it('all deps skippable: all optional', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test' })
        .step({ slug: 'skip1', retriesExhausted: 'skip' }, () => ({ a: 1 }))
        .step({ slug: 'skip2', retriesExhausted: 'skip' }, () => ({ b: 2 }))
        .step({ slug: 'dependent', dependsOn: ['skip1', 'skip2'] }, (deps) => {
          expectTypeOf(deps.skip1).toEqualTypeOf<{ a: number } | undefined>();
          expectTypeOf(deps.skip2).toEqualTypeOf<{ b: number } | undefined>();
          return { done: true };
        });

      type DepInput = StepInput<typeof flow, 'dependent'>;
      expectTypeOf<DepInput>().toEqualTypeOf<{
        skip1?: { a: number };
        skip2?: { b: number };
      }>();
    });

    it('all deps required: none optional', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test' })
        .step({ slug: 'req1' }, () => ({ a: 1 }))
        .step({ slug: 'req2' }, () => ({ b: 2 }))
        .step({ slug: 'dependent', dependsOn: ['req1', 'req2'] }, (deps) => {
          expectTypeOf(deps.req1).toEqualTypeOf<{ a: number }>();
          expectTypeOf(deps.req2).toEqualTypeOf<{ b: number }>();
          return { done: true };
        });

      type DepInput = StepInput<typeof flow, 'dependent'>;
      expectTypeOf<DepInput>().toEqualTypeOf<{
        req1: { a: number };
        req2: { b: number };
      }>();
    });
  });

  describe('chains and graphs', () => {
    it('chain A(skip) -> B -> C: A optional in B, B required in C', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test' })
        .step({ slug: 'a', retriesExhausted: 'skip' }, () => ({ aVal: 1 }))
        .step({ slug: 'b', dependsOn: ['a'] }, (deps) => {
          expectTypeOf(deps.a).toEqualTypeOf<{ aVal: number } | undefined>();
          return { bVal: 2 };
        })
        .step({ slug: 'c', dependsOn: ['b'] }, (deps) => {
          // B is not skippable, so B's output is required
          expectTypeOf(deps.b).toEqualTypeOf<{ bVal: number }>();
          return { cVal: 3 };
        });

      type BInput = StepInput<typeof flow, 'b'>;
      expectTypeOf<BInput>().toEqualTypeOf<{ a?: { aVal: number } }>();

      type CInput = StepInput<typeof flow, 'c'>;
      expectTypeOf<CInput>().toEqualTypeOf<{ b: { bVal: number } }>();
    });

    it('diamond: A(skip) -> B, A -> C, B+C -> D: A optional in B and C', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test' })
        .step({ slug: 'a', retriesExhausted: 'skip' }, () => ({ aVal: 1 }))
        .step({ slug: 'b', dependsOn: ['a'] }, (deps) => {
          expectTypeOf(deps.a).toEqualTypeOf<{ aVal: number } | undefined>();
          return { bVal: 2 };
        })
        .step({ slug: 'c', dependsOn: ['a'] }, (deps) => {
          expectTypeOf(deps.a).toEqualTypeOf<{ aVal: number } | undefined>();
          return { cVal: 3 };
        })
        .step({ slug: 'd', dependsOn: ['b', 'c'] }, (deps) => {
          // B and C are not skippable themselves
          expectTypeOf(deps.b).toEqualTypeOf<{ bVal: number }>();
          expectTypeOf(deps.c).toEqualTypeOf<{ cVal: number }>();
          return { dVal: 4 };
        });

      type BInput = StepInput<typeof flow, 'b'>;
      expectTypeOf<BInput>().toEqualTypeOf<{ a?: { aVal: number } }>();

      type CInput = StepInput<typeof flow, 'c'>;
      expectTypeOf<CInput>().toEqualTypeOf<{ a?: { aVal: number } }>();

      type DInput = StepInput<typeof flow, 'd'>;
      expectTypeOf<DInput>().toEqualTypeOf<{
        b: { bVal: number };
        c: { cVal: number };
      }>();
    });

    it('cascade does NOT propagate: A(skip-cascade) -> B: B output NOT automatically optional', () => {
      // skip-cascade means A and its dependents get skipped at RUNTIME
      // but B itself is not marked as skippable in its definition
      // so if B does run, its output is required for its own dependents
      const flow = new Flow<{ value: number }>({ slug: 'test' })
        .step({ slug: 'a', retriesExhausted: 'skip-cascade' }, () => ({
          aVal: 1,
        }))
        .step({ slug: 'b', dependsOn: ['a'] }, (deps) => {
          expectTypeOf(deps.a).toEqualTypeOf<{ aVal: number } | undefined>();
          return { bVal: 2 };
        })
        .step({ slug: 'c', dependsOn: ['b'] }, (deps) => {
          // B is not skippable in its own definition, so its output is required
          expectTypeOf(deps.b).toEqualTypeOf<{ bVal: number }>();
          return { cVal: 3 };
        });

      type CInput = StepInput<typeof flow, 'c'>;
      expectTypeOf<CInput>().toEqualTypeOf<{ b: { bVal: number } }>();
    });
  });

  describe('edge cases', () => {
    it('root step with skip: valid config, no dependents affected (no deps)', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test' }).step(
        { slug: 'root', retriesExhausted: 'skip' },
        (input) => ({ result: input.value })
      );

      // Root step has no deps, so StepInput is the flow input
      type RootInput = StepInput<typeof flow, 'root'>;
      expectTypeOf<RootInput>().toEqualTypeOf<{ value: number }>();
    });

    it('map step with skip: entire output array is optional type', () => {
      const flow = new Flow<string[]>({ slug: 'test' })
        .map({ slug: 'process', retriesExhausted: 'skip' }, (item) =>
          item.toUpperCase()
        )
        .step({ slug: 'aggregate', dependsOn: ['process'] }, (deps) => {
          expectTypeOf(deps.process).toEqualTypeOf<string[] | undefined>();
          return { done: true };
        });

      type AggInput = StepInput<typeof flow, 'aggregate'>;
      expectTypeOf<AggInput>().toEqualTypeOf<{
        process?: string[];
      }>();
    });

    it('array step with skip: entire output array is optional type', () => {
      const flow = new Flow<{ count: number }>({ slug: 'test' })
        .array({ slug: 'generate', retriesExhausted: 'skip' }, (input) =>
          Array(input.count)
            .fill(0)
            .map((_, i) => i)
        )
        .step({ slug: 'sum', dependsOn: ['generate'] }, (deps) => {
          expectTypeOf(deps.generate).toEqualTypeOf<number[] | undefined>();
          return { done: true };
        });

      type SumInput = StepInput<typeof flow, 'sum'>;
      expectTypeOf<SumInput>().toEqualTypeOf<{
        generate?: number[];
      }>();
    });

    it('both else and retriesExhausted set: still skippable', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test' })
        .step(
          {
            slug: 'both',
            if: { value: 42 },
            else: 'skip',
            retriesExhausted: 'skip',
          },
          () => ({ result: 1 })
        )
        .step({ slug: 'dependent', dependsOn: ['both'] }, (deps) => {
          expectTypeOf(deps.both).toEqualTypeOf<
            { result: number } | undefined
          >();
          return { done: true };
        });

      type DepInput = StepInput<typeof flow, 'dependent'>;
      expectTypeOf<DepInput>().toEqualTypeOf<{
        both?: { result: number };
      }>();
    });
  });

  describe('type inference and narrowing', () => {
    it('cannot access property on optional dep without null check', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test' })
        .step({ slug: 'skippable', retriesExhausted: 'skip' }, () => ({
          foo: 'bar',
        }))
        .step({ slug: 'dependent', dependsOn: ['skippable'] }, (deps) => {
          // Direct property access should be a compile error - we test via runtime pattern
          // The type system should make deps.skippable potentially undefined
          expectTypeOf(deps.skippable).toEqualTypeOf<
            { foo: string } | undefined
          >();
          return { done: true };
        });

      // Type verification
      type DepInput = StepInput<typeof flow, 'dependent'>;
      expectTypeOf<DepInput>().toEqualTypeOf<{ skippable?: { foo: string } }>();
    });

    it('type narrowing works after existence check', () => {
      new Flow<{ value: number }>({ slug: 'test' })
        .step({ slug: 'skippable', retriesExhausted: 'skip' }, () => ({
          foo: 'bar',
        }))
        .step({ slug: 'dependent', dependsOn: ['skippable'] }, (deps) => {
          if (deps.skippable) {
            // After narrowing, foo is accessible
            expectTypeOf(deps.skippable.foo).toEqualTypeOf<string>();
          }
          return { done: true };
        });
    });

    it('handler receives correctly typed deps object', () => {
      new Flow<{ value: number }>({ slug: 'test' })
        .step({ slug: 'skip1', retriesExhausted: 'skip' }, () => ({ a: 1 }))
        .step({ slug: 'req1' }, () => ({ b: 'str' }))
        .step({ slug: 'dependent', dependsOn: ['skip1', 'req1'] }, (deps) => {
          // Handler parameter should have correct mixed optionality
          expectTypeOf(deps).toEqualTypeOf<{
            skip1?: { a: number };
            req1: { b: string };
          }>();
          return { done: true };
        });
    });
  });

  describe('utility types', () => {
    it('StepOutput returns output type (not metadata)', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test' })
        .step({ slug: 'normal' }, () => ({ result: 42 }))
        .step({ slug: 'skippable', retriesExhausted: 'skip' }, () => ({
          other: 'str',
        }));

      // StepOutput should return the actual output type, not the metadata structure
      type NormalOutput = StepOutput<typeof flow, 'normal'>;
      expectTypeOf<NormalOutput>().toEqualTypeOf<{ result: number }>();

      type SkippableOutput = StepOutput<typeof flow, 'skippable'>;
      expectTypeOf<SkippableOutput>().toEqualTypeOf<{ other: string }>();
    });

    it('keyof ExtractFlowSteps still returns slug union', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test' })
        .step({ slug: 'a' }, () => 1)
        .step({ slug: 'b', retriesExhausted: 'skip' }, () => 2)
        .step({ slug: 'c', dependsOn: ['a', 'b'] }, () => 3);

      type StepSlugs = keyof import('../../src/index.js').ExtractFlowSteps<
        typeof flow
      >;
      expectTypeOf<StepSlugs>().toEqualTypeOf<'a' | 'b' | 'c'>();
    });
  });

  describe('dependent map with skippable array source', () => {
    it('dependent map on skippable array: deps should be optional', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test' })
        .array({ slug: 'items', retriesExhausted: 'skip' }, () => [1, 2, 3])
        .map({ slug: 'double', array: 'items' }, (item) => item * 2)
        .step({ slug: 'sum', dependsOn: ['double'] }, (deps) => {
          // The map step itself doesn't have skip, but its source does
          // This is an interesting edge case - map depends on skippable array
          // For now, map's own skippability determines its output optionality
          expectTypeOf(deps.double).toEqualTypeOf<number[]>();
          return { done: true };
        });

      type SumInput = StepInput<typeof flow, 'sum'>;
      expectTypeOf<SumInput>().toEqualTypeOf<{ double: number[] }>();
    });
  });
});

/**
 * Compile-time error tests for skippable deps
 *
 * These tests use @ts-expect-error to verify that TypeScript correctly
 * rejects invalid patterns when accessing skippable dependencies.
 */
describe('skippable deps compile-time errors', () => {
  describe('direct property access on optional deps', () => {
    it('should reject direct property access on skippable dep without null check', () => {
      new Flow<{ value: number }>({ slug: 'test' })
        .step({ slug: 'maybeSkipped', retriesExhausted: 'skip' }, () => ({
          data: 'result',
        }))
        .step({ slug: 'consumer', dependsOn: ['maybeSkipped'] }, (deps) => {
          // @ts-expect-error - deps.maybeSkipped is optional, cannot access .data directly
          const result: string = deps.maybeSkipped.data;
          return { result };
        });
    });

    it('should reject direct property access with else: skip', () => {
      new Flow<{ value: number }>({ slug: 'test' })
        .step({ slug: 'conditional', if: { value: 42 }, else: 'skip' }, () => ({
          processed: true,
        }))
        .step({ slug: 'next', dependsOn: ['conditional'] }, (deps) => {
          // @ts-expect-error - deps.conditional is optional due to else: 'skip'
          const flag: boolean = deps.conditional.processed;
          return { flag };
        });
    });

    it('should reject direct property access with else: skip-cascade', () => {
      new Flow<{ value: number }>({ slug: 'test' })
        .step(
          { slug: 'cascading', if: { value: 42 }, else: 'skip-cascade' },
          () => ({ count: 10 })
        )
        .step({ slug: 'next', dependsOn: ['cascading'] }, (deps) => {
          // @ts-expect-error - deps.cascading is optional due to else: 'skip-cascade'
          const num: number = deps.cascading.count;
          return { num };
        });
    });

    it('should reject direct property access with retriesExhausted: skip-cascade', () => {
      new Flow<{ value: number }>({ slug: 'test' })
        .step({ slug: 'risky', retriesExhausted: 'skip-cascade' }, () => ({
          status: 'ok',
        }))
        .step({ slug: 'next', dependsOn: ['risky'] }, (deps) => {
          // @ts-expect-error - deps.risky is optional due to retriesExhausted: skip-cascade
          const s: string = deps.risky.status;
          return { s };
        });
    });
  });

  describe('mixed deps - optional and required', () => {
    it('should allow direct access on required dep but reject on optional', () => {
      new Flow<{ value: number }>({ slug: 'test' })
        .step({ slug: 'required' }, () => ({ reqData: 'always' }))
        .step({ slug: 'optional', retriesExhausted: 'skip' }, () => ({
          optData: 'maybe',
        }))
        .step(
          { slug: 'consumer', dependsOn: ['required', 'optional'] },
          (deps) => {
            // This is fine - required dep is always present
            const req: string = deps.required.reqData;

            // @ts-expect-error - deps.optional is optional, cannot access .optData directly
            const opt: string = deps.optional.optData;

            return { req, opt };
          }
        );
    });
  });

  describe('array and map steps with skip modes', () => {
    it('should reject direct access on skippable array step output', () => {
      new Flow<{ items: string[] }>({ slug: 'test' })
        .array({ slug: 'processed', retriesExhausted: 'skip' }, (input) =>
          input.items.map((s) => s.toUpperCase())
        )
        .step({ slug: 'consumer', dependsOn: ['processed'] }, (deps) => {
          // @ts-expect-error - deps.processed is optional, cannot access .length directly
          const len: number = deps.processed.length;
          return { len };
        });
    });

    it('should reject direct access on skippable map step output', () => {
      new Flow<string[]>({ slug: 'test' })
        .map(
          { slug: 'doubled', retriesExhausted: 'skip' },
          (item) => item + item
        )
        .step({ slug: 'consumer', dependsOn: ['doubled'] }, (deps) => {
          // @ts-expect-error - deps.doubled is optional, cannot access [0] directly
          const first: string = deps.doubled[0];
          return { first };
        });
    });
  });
});
