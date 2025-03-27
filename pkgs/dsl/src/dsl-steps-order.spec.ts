import { Flow, type StepInput } from './dsl.ts';
import { describe, it, expect, expectTypeOf } from 'vitest';

describe('Flow Steps Order Type Safety', () => {
  it('should return step handlers with correctly typed input arguments', () => {
    // Create a flow with multiple steps and dependencies
    const flow = new Flow<{ initialValue: number }>({ slug: 'test-flow' })
      .step({ slug: 'step1' }, (payload) => {
        // Verify the entire payload type is correct
        expectTypeOf(payload).toEqualTypeOf<{
          run: { initialValue: number };
        }>();
        return { doubled: payload.run.initialValue * 2 };
      })
      .step({ slug: 'step2', dependsOn: ['step1'] }, (payload) => {
        // Verify the entire payload type is correct with all required dependencies
        expectTypeOf(payload).toEqualTypeOf<{
          run: { initialValue: number };
          step1: { doubled: number };
        }>();
        return { quadrupled: payload.step1.doubled * 2 };
      })
      .step({ slug: 'step3', dependsOn: ['step1', 'step2'] }, (payload) => {
        // Verify the entire payload type is correct with all required dependencies
        expectTypeOf(payload).toEqualTypeOf<{
          run: { initialValue: number };
          step1: { doubled: number };
          step2: { quadrupled: number };
        }>();
        return { sum: payload.step1.doubled + payload.step2.quadrupled };
      });

    // Get steps in order
    const stepsInOrder = flow.getStepsInOrder();

    // Verify the steps are returned in the correct order
    expect(stepsInOrder.map((step) => step.slug)).toEqual([
      'step1',
      'step2',
      'step3',
    ]);

    // Runtime test for handler execution
    const runPayload = { initialValue: 5 };
    const step1Result = { doubled: 10 };
    const step2Result = { quadrupled: 20 };

    // Execute step1 handler
    const step1Handler = stepsInOrder[0].handler;
    // Verify the handler's parameter type
    expectTypeOf(step1Handler).parameters.toEqualTypeOf<
      [{ run: { initialValue: number } }]
    >();
    const step1Output = step1Handler({ run: runPayload });
    expect(step1Output).toEqual(step1Result);

    // Execute step2 handler
    const step2Handler = stepsInOrder[1].handler;
    // Verify the handler's parameter type
    expectTypeOf(step2Handler).parameters.toEqualTypeOf<
      [{ run: { initialValue: number }; step1: { doubled: number } }]
    >();
    const step2Output = step2Handler({ run: runPayload, step1: step1Result });
    expect(step2Output).toEqual(step2Result);

    // Execute step3 handler
    const step3Handler = stepsInOrder[2].handler;
    // Verify the handler's parameter type
    expectTypeOf(step3Handler).parameters.toEqualTypeOf<
      [
        {
          run: { initialValue: number };
          step1: { doubled: number };
          step2: { quadrupled: number };
        }
      ]
    >();
    const step3Output = step3Handler({
      run: runPayload,
      step1: step1Result,
      step2: step2Result,
    });
    expect(step3Output).toEqual({ sum: 30 });
  });

  it('should provide type-safe access to step handlers', () => {
    // This test verifies that TypeScript correctly enforces type safety
    // when accessing step handlers from getStepsInOrder

    const flow = new Flow<{ value: string }>({ slug: 'type-safe-flow' })
      .step({ slug: 'parse' }, (payload) => {
        // Verify the entire payload type
        expectTypeOf(payload).toEqualTypeOf<{ run: { value: string } }>();
        return { parsed: parseInt(payload.run.value) };
      })
      .step({ slug: 'validate', dependsOn: ['parse'] }, (payload) => {
        // Verify the entire payload type with all required dependencies
        expectTypeOf(payload).toEqualTypeOf<{
          run: { value: string };
          parse: { parsed: number };
        }>();
        return { isValid: !isNaN(payload.parse.parsed) };
      });

    const steps = flow.getStepsInOrder();

    // The first step should accept { run: { value: string } }
    const parseStep = steps[0];
    // Verify the handler's parameter type
    expectTypeOf(parseStep.handler).parameters.toEqualTypeOf<
      [{ run: { value: string } }]
    >();
    const parseResult = parseStep.handler({ run: { value: '42' } });
    expect(parseResult).toEqual({ parsed: 42 });

    // The second step should accept { run: { value: string }, parse: { parsed: number } }
    const validateStep = steps[1];
    // Verify the handler's parameter type
    expectTypeOf(validateStep.handler).parameters.toEqualTypeOf<
      [{ run: { value: string }; parse: { parsed: number } }]
    >();
    const validateResult = validateStep.handler({
      run: { value: '42' },
      parse: { parsed: 42 },
    });
    expect(validateResult).toEqual({ isValid: true });

    // Type error test (commented out as it would cause compilation error)
    // This would fail type checking if uncommented:
    // validateStep.handler({ run: { value: '42' } }); // Missing 'parse' dependency
    // validateStep.handler({ run: { value: '42' }, parse: { parsed: 42 }, extra: true }); // Extra property not allowed
  });

  it('should enforce strict payload types with no extra properties', () => {
    // This test verifies that the StepInput type is strict and doesn't allow extra properties

    type TestRunPayload = { id: number };
    type TestSteps = {
      step1: { result: string };
      step2: { count: number };
    };

    // Test StepInput with no dependencies
    type Step1Input = StepInput<TestRunPayload, TestSteps, 'step1'>;
    expectTypeOf<Step1Input>().toEqualTypeOf<{ run: TestRunPayload }>();

    // Test StepInput with dependencies
    type Step2Input = StepInput<TestRunPayload, TestSteps, 'step2'>;
    expectTypeOf<Step2Input>().toEqualTypeOf<{
      run: TestRunPayload;
      step1: TestSteps['step1'];
    }>();

    // Create a flow to test runtime behavior
    const testFlow = new Flow<{ id: number }>({ slug: 'strict-payload-flow' })
      .step({ slug: 'step1' }, (payload) => {
        // This should compile
        const validPayload: typeof payload = { run: { id: 123 } };

        // @ts-expect-error - Extra property should not be allowed
        const invalidPayload: typeof payload = {
          run: { id: 123 },
          extra: 'not allowed',
        };

        return { result: `ID: ${payload.run.id}` };
      })
      .step({ slug: 'step2', dependsOn: ['step1'] }, (payload) => {
        // This should compile
        const validPayload: typeof payload = {
          run: { id: 123 },
          step1: { result: 'ID: 123' },
        };

        // @ts-expect-error - Extra property should not be allowed
        const invalidPayload: typeof payload = {
          run: { id: 123 },
          step1: { result: 'ID: 123' },
          extra: 'not allowed',
        };

        // @ts-expect-error - Missing required dependency
        const missingDep: typeof payload = { run: { id: 123 } };

        return { count: payload.run.id + payload.step1.result.length };
      });

    // Just to avoid unused variable warning
    expect(testFlow).toBeDefined();
    // validateStep.handler({ parse: { parsed: 42 } }); // Missing 'run'
  });
});
