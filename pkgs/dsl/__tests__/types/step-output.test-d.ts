import { Flow, type StepOutput } from '../../src/index.ts';
import { describe, it, expectTypeOf } from 'vitest';

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
