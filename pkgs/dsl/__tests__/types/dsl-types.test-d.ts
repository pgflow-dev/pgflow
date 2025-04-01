import { Flow, type StepOutput } from '../../src/dsl.ts';
import { describe, it, expectTypeOf } from 'vitest';

describe('Flow Type System Tests', () => {
  it('should properly type input argument for root steps', () => {
    new Flow<{ id: number; email: string }>({
      slug: 'test_flow',
    }).step({ slug: 'root_a' }, (input) => {
      expectTypeOf(input).toMatchTypeOf<{
        run: { id: number; email: string };
      }>();
      return { result: 'test-result' };
    });
  });

  it('should properly type input arguments for dependent steps', () => {
    new Flow<{ id: number; email: string }>({
      slug: 'test_flow',
    })
      .step({ slug: 'root_a' }, (input) => {
        expectTypeOf(input).toMatchTypeOf<{
          run: { id: number; email: string };
        }>();
        return { result: 'test-result' };
      })
      .step({ slug: 'step_a', dependsOn: ['root_a'] }, (input) => {
        expectTypeOf(input).toMatchTypeOf<{
          run: { id: number; email: string };
          root_a: { result: string };
        }>();
        return { count: 42 };
      })
      .step(
        { slug: 'final_step', dependsOn: ['root_a', 'step_a'] },
        (input) => {
          expectTypeOf(input).toMatchTypeOf<{
            run: { id: number; email: string };
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
        .step({ slug: 'step3', dependsOn: ['step1'] }, (payload) => {
          expectTypeOf(payload).toMatchTypeOf<{
            run: string;
            step1: number;
          }>();

          // Verify that step2 is not accessible
          expectTypeOf<typeof payload>().not.toHaveProperty('step2');

          return payload.step1;
        });
    });
  });

  describe('Multi-level dependencies', () => {
    it('should correctly type multi-level dependencies', () => {
      new Flow<string>({ slug: 'test_flow' })
        .step({ slug: 'first' }, (payload) => {
          expectTypeOf(payload).toMatchTypeOf<{ run: string }>();
          return 5;
        })
        .step({ slug: 'second', dependsOn: ['first'] }, (payload) => {
          expectTypeOf(payload).toMatchTypeOf<{
            run: string;
            first: number;
          }>();

          return [payload.run] as string[];
        })
        .step({ slug: 'third', dependsOn: ['first', 'second'] }, (payload) => {
          expectTypeOf(payload).toMatchTypeOf<{
            run: string;
            first: number;
            second: string[];
          }>();

          return 15;
        });
    });
  });

  describe('StepOutput utility type', () => {
    it('should correctly extract the output type of a step', () => {
      const flow = new Flow<{ input: string }>({ slug: 'step_output_test' })
        .step({ slug: 'step1' }, () => ({ value: 42, text: 'hello' }))
        .step({ slug: 'step2', dependsOn: ['step1'] }, () => ({ flag: true }))
        .step({ slug: 'step3' }, () => 'plain string');

      // Test various StepOutput types
      type Step1Output = StepOutput<typeof flow, 'step1'>;
      expectTypeOf<Step1Output>().toMatchTypeOf<{
        value: number;
        text: string;
      }>();

      type Step2Output = StepOutput<typeof flow, 'step2'>;
      expectTypeOf<Step2Output>().toMatchTypeOf<{ flag: boolean }>();

      type Step3Output = StepOutput<typeof flow, 'step3'>;
      expectTypeOf<Step3Output>().toMatchTypeOf<string>();

      type NonExistentOutput = StepOutput<typeof flow, 'nonExistentStep'>;
      expectTypeOf<NonExistentOutput>().toMatchTypeOf<never>();
    });

    it('should work with complex nested types', () => {
      const complexFlow = new Flow<{ id: number }>({
        slug: 'complex_flow',
      }).step({ slug: 'complexStep' }, () => ({
        data: {
          items: [
            { id: 1, name: 'Item 1' },
            { id: 2, name: 'Item 2' },
          ],
          metadata: {
            count: 2,
            lastUpdated: '2023-01-01',
          },
        },
      }));

      type ComplexStepOutput = StepOutput<typeof complexFlow, 'complexStep'>;
      expectTypeOf<ComplexStepOutput>().toMatchTypeOf<{
        data: {
          items: Array<{ id: number; name: string }>;
          metadata: {
            count: number;
            lastUpdated: string;
          };
        };
      }>();
    });
  });
});
