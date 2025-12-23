import { Flow } from '../../src/index.js';
import { describe, it, expectTypeOf } from 'vitest';

describe('Flow Type System Tests', () => {
  it('should properly type input argument for root steps', () => {
    new Flow<{ id: number; email: string }>({
      slug: 'test_flow',
    }).step({ slug: 'root_a' }, (flowInput) => {
      // Root steps receive flow input directly (no run key)
      expectTypeOf(flowInput).toMatchTypeOf<{
        id: number;
        email: string;
      }>();
      return { result: 'test-result' };
    });
  });

  it('should properly type input arguments for dependent steps', () => {
    new Flow<{ id: number; email: string }>({
      slug: 'test_flow',
    })
      .step({ slug: 'root_a' }, (flowInput) => {
        // Root step receives flow input directly
        expectTypeOf(flowInput).toMatchTypeOf<{
          id: number;
          email: string;
        }>();
        return { result: 'test-result' };
      })
      .step({ slug: 'step_a', dependsOn: ['root_a'] }, (deps) => {
        // Dependent step receives deps only (no run key)
        expectTypeOf(deps).toMatchTypeOf<{
          root_a: { result: string };
        }>();
        return { count: 42 };
      })
      .step(
        { slug: 'final_step', dependsOn: ['root_a', 'step_a'] },
        (deps) => {
          // Dependent step with multiple deps
          expectTypeOf(deps).toMatchTypeOf<{
            root_a: { result: string };
            step_a: { count: number };
          }>();
          return { flag: true };
        }
      );
  });

  describe('Flow dependency validation', () => {
    it('should catch non-existent steps at compile time', () => {
      const testFlow = new Flow<string>({ slug: 'test_flow' }).step(
        { slug: 'step1' },
        () => 5
      );

      // Type assertion to verify compile-time error
      type TestType = Parameters<typeof testFlow.step>[0]['dependsOn'];
      // @ts-expect-error - should only allow 'step1' as a valid dependency
      const invalidDeps: TestType = ['nonExistentStep'];
    });

    it('should not allow access to non-dependencies', () => {
      new Flow<string>({ slug: 'test_flow' })
        .step({ slug: 'step1' }, () => 1)
        .step({ slug: 'step2' }, () => 2)
        .step({ slug: 'step3', dependsOn: ['step1'] }, (deps) => {
          // Dependent step receives deps only (no run key)
          expectTypeOf(deps).toMatchTypeOf<{
            step1: number;
          }>();

          // Verify that step2 is not accessible
          expectTypeOf(deps).not.toHaveProperty('step2');

          return deps.step1;
        });
    });
  });

  describe('Multi-level dependencies', () => {
    it('should correctly type multi-level dependencies', () => {
      new Flow<string>({ slug: 'test_flow' })
        .step({ slug: 'first' }, (flowInput) => {
          // Root step receives flow input directly
          expectTypeOf(flowInput).toMatchTypeOf<string>();
          return 5;
        })
        .step({ slug: 'second', dependsOn: ['first'] }, (deps) => {
          // Dependent step receives deps only (no run key)
          expectTypeOf(deps).toMatchTypeOf<{
            first: number;
          }>();

          return ['test'] as string[];
        })
        .step({ slug: 'third', dependsOn: ['first', 'second'] }, (deps) => {
          // Dependent step with multiple deps
          expectTypeOf(deps).toMatchTypeOf<{
            first: number;
            second: string[];
          }>();

          return 15;
        });
    });
  });
});
