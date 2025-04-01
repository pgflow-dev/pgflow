import { Flow } from '../../src/dsl.ts';
import { describe, it, expect, expectTypeOf } from 'vitest';

describe('Flow Steps Order Type Safety', () => {
  // Create original flow outside of tests
  const originalFlow = new Flow<{ initialValue: number }>({
    slug: 'test_flow',
  })
    .step({ slug: 'step1' }, (payload) => {
      return { doubled: payload.run.initialValue * 2 };
    })
    .step({ slug: 'step2', dependsOn: ['step1'] }, (payload) => {
      return { quadrupled: payload.step1.doubled * 2 };
    })
    .step({ slug: 'step3', dependsOn: ['step1', 'step2'] }, (payload) => {
      return { sum: payload.step1.doubled + payload.step2.quadrupled };
    });

  // Helper function to create a reconstructed flow
  const createReconstructedFlow = () => {
    const stepsInOrder = originalFlow.getStepsInOrder();
    return stepsInOrder.reduce((flow, stepDef) => {
      // Only include dependsOn if there are dependencies
      const stepConfig = {
        slug: stepDef.slug,
        ...stepDef.options,
      };

      // Add dependencies only if they exist
      if (stepDef.dependencies.length > 0) {
        Object.assign(stepConfig, { dependsOn: stepDef.dependencies });
      }

      return flow.step(stepConfig, stepDef.handler);
    }, new Flow<{ initialValue: number }>({ slug: 'reconstructed_flow' }));
  };

  it('should reconstruct a flow with the same number of steps', () => {
    const reconstructedFlow = createReconstructedFlow();

    const originalSteps = originalFlow.getStepsInOrder();
    const reconstructedSteps = reconstructedFlow.getStepsInOrder();

    expect(reconstructedSteps.length).toBe(originalSteps.length);
  });

  it('should maintain step slugs and dependencies in reconstructed flow', () => {
    const reconstructedFlow = createReconstructedFlow();

    const originalSteps = originalFlow.getStepsInOrder();
    const reconstructedSteps = reconstructedFlow.getStepsInOrder();

    for (let i = 0; i < originalSteps.length; i++) {
      const originalStep = originalSteps[i];
      const reconstructedStep = reconstructedSteps[i];

      expect(reconstructedStep.slug).toBe(originalStep.slug);
      expect(reconstructedStep.dependencies).toEqual(originalStep.dependencies);
    }
  });

  it('should maintain type compatibility between original and reconstructed steps', () => {
    const reconstructedFlow = createReconstructedFlow();

    const originalSteps = originalFlow.getStepsInOrder();
    const reconstructedSteps = reconstructedFlow.getStepsInOrder();

    for (let i = 0; i < originalSteps.length; i++) {
      const originalStep = originalSteps[i];
      const reconstructedStep = reconstructedSteps[i];

      // Verify the handler parameter types match
      expectTypeOf(reconstructedStep.handler)
        .parameter(0)
        .toMatchTypeOf(expectTypeOf(originalStep.handler).parameter(0));

      // Verify the handler return types match
      expectTypeOf(reconstructedStep.handler).returns.toEqualTypeOf<
        ReturnType<typeof originalStep.handler>
      >();
    }
  });

  it('should produce the same results when executing step handlers', () => {
    const reconstructedFlow = createReconstructedFlow();

    const originalSteps = originalFlow.getStepsInOrder();
    const reconstructedSteps = reconstructedFlow.getStepsInOrder();

    // Test inputs for each step
    const mockInputs = [
      // For step1
      { run: { initialValue: 10 } },
      // For step2
      {
        run: { initialValue: 10 },
        step1: { doubled: 20 },
      },
      // For step3
      {
        run: { initialValue: 10 },
        step1: { doubled: 20 },
        step2: { quadrupled: 40 },
      },
    ];

    for (let i = 0; i < originalSteps.length; i++) {
      const originalStep = originalSteps[i];
      const reconstructedStep = reconstructedSteps[i];
      const mockInput = mockInputs[i];

      // Execute the handlers with the same input and verify they produce the same result
      const originalResult = originalStep.handler(mockInput);
      const reconstructedResult = reconstructedStep.handler(mockInput);
      expect(reconstructedResult).toEqual(originalResult);
    }
  });
});
