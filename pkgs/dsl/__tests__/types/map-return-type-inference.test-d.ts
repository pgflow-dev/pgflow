import { Flow } from '../../src/index.js';
import { describe, it, expectTypeOf } from 'vitest';

describe('map step return type inference bug', () => {
  it('should preserve specific return type from map handler, not collapse to any[]', () => {
    const flow = new Flow<{ items: string[] }>({ slug: 'test' })
      .array({ slug: 'chunks' }, async ({ run }) => {
        return [{ data: 'chunk1' }, { data: 'chunk2' }];
      })
      .map(
        { slug: 'processChunks', array: 'chunks' },
        async (chunk) => {
          return {
            chunkIndex: 0,
            successes: ['success1'],
            errors: [{ line: 1, error: 'test error' }],  // Non-empty array for inference
          };
        }
      )
      .step(
        { slug: 'aggregate', dependsOn: ['processChunks'] },
        async ({ run, processChunks }) => {
          // Verify types are inferred correctly
          expectTypeOf(processChunks).not.toEqualTypeOf<any[]>();

          // These should all have proper types, not any
          for (const result of processChunks) {
            expectTypeOf(result.chunkIndex).toEqualTypeOf<number>();
            expectTypeOf(result.chunkIndex).not.toEqualTypeOf<any>();
            expectTypeOf(result.successes).toEqualTypeOf<string[]>();
            expectTypeOf(result.successes).not.toEqualTypeOf<any>();
            expectTypeOf(result.errors).toMatchTypeOf<Array<{ line: number; error: string }>>();
            expectTypeOf(result.errors).not.toEqualTypeOf<any>();
          }

          return { done: true };
        }
      );

    // Verify the map step output type is not any[]
    type ProcessChunksOutput = typeof flow extends Flow<any, any, infer Steps, any>
      ? Steps['processChunks']
      : never;

    expectTypeOf<ProcessChunksOutput>().not.toEqualTypeOf<any[]>();
  });

  it('should preserve complex nested types through map', () => {
    // Note: optional properties not in the return object are not inferred by TypeScript
    type ComplexResult = {
      nested: { deep: { value: string } };
      array: number[];
    };

    const flow = new Flow<Record<string, never>>({ slug: 'test' })
      .array({ slug: 'items' }, () => [1, 2, 3])
      .map({ slug: 'transform', array: 'items' }, async (item) => {
        return {
          nested: { deep: { value: 'test' } },
          array: [1, 2, 3]
        };
      })
      .step({ slug: 'use', dependsOn: ['transform'] }, ({ transform }) => {
        expectTypeOf(transform).toEqualTypeOf<ComplexResult[]>();
        expectTypeOf(transform).not.toEqualTypeOf<any[]>();

        // Verify nested structure is preserved
        expectTypeOf(transform[0].nested.deep.value).toEqualTypeOf<string>();
        expectTypeOf(transform[0].nested.deep.value).not.toEqualTypeOf<any>();
        expectTypeOf(transform[0].array).toEqualTypeOf<number[]>();
        expectTypeOf(transform[0].array).not.toEqualTypeOf<any>();

        return { ok: true };
      });

    type TransformOutput = typeof flow extends Flow<any, any, infer Steps, any>
      ? Steps['transform']
      : never;

    expectTypeOf<TransformOutput>().toEqualTypeOf<ComplexResult[]>();
    expectTypeOf<TransformOutput>().not.toEqualTypeOf<any[]>();
  });

  it('should preserve union-like return types from map', () => {
    // Test that return types with discriminated union pattern are inferred correctly
    const flow = new Flow<number[]>({ slug: 'test' })
      .map({ slug: 'process' }, async (item) => {
        // Return explicit objects to help TypeScript inference
        const success = { success: true as const, data: 'ok' };
        const failure = { success: false as const, error: 'fail' };
        return Math.random() > 0.5 ? success : failure;
      })
      .step({ slug: 'aggregate', dependsOn: ['process'] }, ({ process }) => {
        expectTypeOf(process).not.toEqualTypeOf<any[]>();

        // Verify the inferred type preserves the shape
        const firstResult = process[0];
        expectTypeOf(firstResult.success).toEqualTypeOf<boolean>();

        return { done: true };
      });

    type ProcessOutput = typeof flow extends Flow<any, any, infer Steps, any>
      ? Steps['process']
      : never;

    expectTypeOf<ProcessOutput>().not.toEqualTypeOf<any[]>();
  });

  it('should work with inferred return types (no explicit Promise type)', () => {
    const flow = new Flow<string[]>({ slug: 'test' })
      .map({ slug: 'transform' }, (item) => {
        return { value: item.toUpperCase(), length: item.length };
      })
      .step({ slug: 'use', dependsOn: ['transform'] }, ({ transform }) => {
        // Should infer { value: string; length: number }[]
        expectTypeOf(transform).toEqualTypeOf<{ value: string; length: number }[]>();
        expectTypeOf(transform).not.toEqualTypeOf<any[]>();

        for (const result of transform) {
          expectTypeOf(result.value).toEqualTypeOf<string>();
          expectTypeOf(result.value).not.toEqualTypeOf<any>();
          expectTypeOf(result.length).toEqualTypeOf<number>();
          expectTypeOf(result.length).not.toEqualTypeOf<any>();
        }

        return { ok: true };
      });

    type TransformOutput = typeof flow extends Flow<any, any, infer Steps, any>
      ? Steps['transform']
      : never;

    expectTypeOf<TransformOutput>().toEqualTypeOf<{ value: string; length: number }[]>();
    expectTypeOf<TransformOutput>().not.toEqualTypeOf<any[]>();
  });

  it('should work with root map (no array dependency)', () => {
    const flow = new Flow<string[]>({ slug: 'test' })
      .map({ slug: 'uppercase' }, (item) => {
        return { original: item, transformed: item.toUpperCase() };
      })
      .step({ slug: 'aggregate', dependsOn: ['uppercase'] }, ({ uppercase }) => {
        expectTypeOf(uppercase).toEqualTypeOf<{ original: string; transformed: string }[]>();
        expectTypeOf(uppercase).not.toEqualTypeOf<any[]>();

        for (const result of uppercase) {
          expectTypeOf(result.original).toEqualTypeOf<string>();
          expectTypeOf(result.original).not.toEqualTypeOf<any>();
          expectTypeOf(result.transformed).toEqualTypeOf<string>();
          expectTypeOf(result.transformed).not.toEqualTypeOf<any>();
        }

        return { count: uppercase.length };
      });

    type UppercaseOutput = typeof flow extends Flow<any, any, infer Steps, any>
      ? Steps['uppercase']
      : never;

    expectTypeOf<UppercaseOutput>().toEqualTypeOf<{ original: string; transformed: string }[]>();
    expectTypeOf<UppercaseOutput>().not.toEqualTypeOf<any[]>();
  });
});
