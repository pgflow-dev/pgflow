import { Flow, type StepOutput } from './dsl.ts';
import { describe, it, expectTypeOf, expect } from 'vitest';
// Test StepInput utility type
it('should enforce strict payload types with StepInput utility type', () => {
  // Define test types
  type TestRunPayload = { id: number };
  type TestSteps = {
    step1: { result: string };
    step2: { count: number };
    step3: { flag: boolean };
  };

  // Test StepInput with no dependencies
  type Step1Input = StepInput<TestRunPayload, TestSteps, 'step1'>;
  expectTypeOf<Step1Input>().toEqualTypeOf<{ run: TestRunPayload }>();

  // Test StepInput with one dependency
  type Step2Input = StepInput<TestRunPayload, TestSteps, 'step2'>;
  expectTypeOf<Step2Input>().toEqualTypeOf<{
    run: TestRunPayload;
    step1: TestSteps['step1'];
  }>();

  // Test StepInput with multiple dependencies
  type Step3Input = StepInput<TestRunPayload, TestSteps, 'step3'>;
  expectTypeOf<Step3Input>().toEqualTypeOf<{
    run: TestRunPayload;
    step1: TestSteps['step1'];
    step2: TestSteps['step2'];
  }>();

  // Verify that extra properties are not allowed
  // @ts-expect-error - Extra property not allowed
  const invalidStep1Input: Step1Input = {
    run: { id: 123 },
    extra: 'not allowed',
  };

  // Verify that required dependencies cannot be omitted
  // @ts-expect-error - Missing required dependency
  const missingDepStep2Input: Step2Input = { run: { id: 123 } };

  // Verify that required dependencies cannot be omitted
  // @ts-expect-error - Missing required dependencies
  const missingDepsStep3Input: Step3Input = {
    run: { id: 123 },
    step1: { result: 'test' },
  };
});

// Define distinct literal types for each test case
// First test case types
type CountInput = 42;
type CountOutput = 84;

// Second test case types
type TextInput = 'hello';
type TextLength = 5;
type TextDoubled = 10;
type TextCombined = 15;

// Third test case types
type FlagInput = true;
type FlagOutput = false;
type FlagNumeric = 0;

// Fourth test case types
type AccessInput = 'access';
type AccessOutput1 = 1;
type AccessOutput2 = 2;

describe('Flow Type Safety', () => {
  // Test basic flow setup and type inference
  it('should correctly type the payload based on dependsOn', () => {
    new Flow<CountInput>({ slug: 'test-flow' })
      .step({ slug: 'step1' }, (payload) => {
        // Verify the entire payload type is correct
        expectTypeOf(payload).toEqualTypeOf<{ run: CountInput }>();

        const invalidPayload: typeof payload = {
          run: 42 as CountInput,
          // @ts-expect-error - Extra property not allowed in payload
          extra: 'not allowed',
        };

        return 84 as CountOutput;
      })
      .step({ slug: 'step2', dependsOn: ['step1'] }, (payload) => {
        // Verify the entire payload type is correct with all required dependencies
        expectTypeOf(payload).toEqualTypeOf<{
          run: CountInput;
          step1: CountOutput;
        }>();

        const invalidPayload: typeof payload = {
          run: 42 as CountInput,
          step1: 84 as CountOutput,
          // @ts-expect-error - Extra property not allowed in payload
          extra: 'not allowed',
        };

        // @ts-expect-error - Missing required dependency
        const missingDep: typeof payload = { run: 42 as CountInput };

        return 84 as CountOutput;
      });

    // Type-level verification is now done directly through the Flow type system
  });

  // Test dependsOn type constraints
  it('should catch non-existent steps at compile time', () => {
    const testFlow = new Flow<TextInput>({ slug: 'test-flow' }).step(
      { slug: 'step1' },
      () => 5 as TextLength
    );

    // Type assertion to verify compile-time error
    type TestType = Parameters<typeof testFlow.step>[0]['dependsOn'];
    // @ts-expect-error - should only allow 'step1' as a valid dependency
    const invalidDeps: TestType = ['nonExistentStep'];
  });

  it('should throw an error when depending on non-existent steps at runtime', () => {
    const testFlow = new Flow<TextInput>({ slug: 'test-flow' }).step(
      { slug: 'step1' },
      () => 5 as TextLength
    );

    // Test runtime validation
    expect(() => {
      testFlow.step(
        {
          slug: 'runtimeInvalid',
          dependsOn: ['nonExistentStep' as any], // Cast to bypass TypeScript error
        },
        () => 0 as TextLength
      );
    }).toThrow(
      'Step "runtimeInvalid" depends on undefined step "nonExistentStep"'
    );
  });

  // Test payload access constraints
  it('should only allow access to dependencies declared in dependsOn', () => {
    const testFlow = new Flow<AccessInput>({ slug: 'test-flow' })
      .step({ slug: 'step1' }, (payload) => {
        // Verify the entire payload type is correct
        expectTypeOf(payload).toEqualTypeOf<{ run: AccessInput }>();
        return 1 as AccessOutput1;
      })
      .step({ slug: 'step2' }, (payload) => {
        // Verify the entire payload type is correct
        expectTypeOf(payload).toEqualTypeOf<{ run: AccessInput }>();
        return 2 as AccessOutput2;
      })
      .step({ slug: 'step3', dependsOn: ['step1'] }, (payload) => {
        // Verify the entire payload type is correct with all required dependencies
        expectTypeOf(payload).toEqualTypeOf<{
          run: AccessInput;
          step1: AccessOutput1;
        }>();

        // Valid access
        const val1 = payload.step1;

        // @ts-expect-error - step2 not declared in dependsOn
        const val2 = payload.step2;

        // @ts-expect-error - Extra property not allowed in payload
        const invalidPayload: typeof payload = {
          run: 'access' as AccessInput,
          step1: 1 as AccessOutput1,
          extra: 'not allowed',
        };

        // @ts-expect-error - Missing required dependency
        const missingDep: typeof payload = { run: 'access' as AccessInput };

        return val1;
      });
    // Just to avoid unused variable warning
    expect(testFlow).toBeDefined();
  });

  // Test more complex dependency chains
  it('should correctly type multi-level dependencies', () => {
    new Flow<TextInput>({ slug: 'test-flow' })
      .step({ slug: 'first' }, (payload) => {
        // Verify the entire payload type is correct
        expectTypeOf(payload).toEqualTypeOf<{ run: TextInput }>();
        return 5 as TextLength;
      })
      .step({ slug: 'second', dependsOn: ['first'] }, (payload) => {
        // Verify the entire payload type is correct with all required dependencies
        expectTypeOf(payload).toEqualTypeOf<{
          run: TextInput;
          first: TextLength;
        }>();
        return 10 as TextDoubled;
      })
      .step({ slug: 'third', dependsOn: ['first', 'second'] }, (payload) => {
        // Verify the entire payload type is correct with all required dependencies
        expectTypeOf(payload).toEqualTypeOf<{
          run: TextInput;
          first: TextLength;
          second: TextDoubled;
        }>();

        // @ts-expect-error - Extra property not allowed in payload
        const invalidPayload: typeof payload = {
          run: 'hello' as TextInput,
          first: 5 as TextLength,
          second: 10 as TextDoubled,
          extra: 'not allowed',
        };

        // @ts-expect-error - Missing required dependency
        const missingDep1: typeof payload = {
          run: 'hello' as TextInput,
          first: 5 as TextLength,
        };

        // @ts-expect-error - Missing required dependency
        const missingDep2: typeof payload = {
          run: 'hello' as TextInput,
          second: 10 as TextDoubled,
        };

        return 15 as TextCombined;
      });
  });

  // Test run payload accessibility
  it('should always include run payload in handler', () => {
    new Flow<FlagInput>({ slug: 'test-flow' })
      .step({ slug: 'step1' }, (payload) => {
        // Verify the entire payload type is correct
        expectTypeOf(payload).toEqualTypeOf<{ run: FlagInput }>();

        const invalidPayload: typeof payload = {
          run: true as FlagInput,
          // @ts-expect-error - Extra property not allowed in payload
          extra: 'not allowed',
        };

        return false as FlagOutput;
      })
      .step({ slug: 'step2', dependsOn: ['step1'] }, (payload) => {
        // Verify the entire payload type is correct with all required dependencies
        expectTypeOf(payload).toEqualTypeOf<{
          run: FlagInput;
          step1: FlagOutput;
        }>();

        // @ts-expect-error - Extra property not allowed in payload
        const invalidPayload: typeof payload = {
          run: true as FlagInput,
          step1: false as FlagOutput,
          extra: 'not allowed',
        };

        // @ts-expect-error - Missing required dependency
        const missingDep: typeof payload = { run: true as FlagInput };

        return 0 as FlagNumeric;
      });
  });

  // Test getStepDefinition with non-existent step
  it('should throw an error when getStepDefinition is called for a non-existent step', () => {
    const testFlow = new Flow<TextInput>({ slug: 'test-flow' }).step(
      { slug: 'step1' },
      () => 5 as TextLength
    );

    // Test runtime validation for getStepDefinition
    expect(() => {
      // Using type assertion to bypass TypeScript's type checking
      testFlow.getStepDefinition('nonExistentStep' as any);
    }).toThrow('Step "nonExistentStep" does not exist in flow "test-flow"');
  });

  // Tests for StepOutput utility type
  describe('StepOutput utility type', () => {
    it('should correctly extract the output type of a step', () => {
      const flow = new Flow<{ input: string }>({ slug: 'step-output-test' })
        .step({ slug: 'step1' }, () => ({ value: 42, text: 'hello' }))
        .step({ slug: 'step2', dependsOn: ['step1'] }, () => ({ flag: true }))
        .step({ slug: 'step3' }, () => 'plain string');

      // Test StepOutput with step1
      type Step1Output = StepOutput<typeof flow, 'step1'>;
      expectTypeOf<Step1Output>().toMatchTypeOf<{
        value: number;
        text: string;
      }>();

      // Test StepOutput with step2
      type Step2Output = StepOutput<typeof flow, 'step2'>;
      expectTypeOf<Step2Output>().toMatchTypeOf<{ flag: boolean }>();

      // Test StepOutput with step3
      type Step3Output = StepOutput<typeof flow, 'step3'>;
      expectTypeOf<Step3Output>().toMatchTypeOf<string>();

      // Test StepOutput with non-existent step
      type NonExistentStepOutput = StepOutput<typeof flow, 'nonExistentStep'>;
      expectTypeOf<NonExistentStepOutput>().toMatchTypeOf<never>();
    });

    it('should work with complex nested types', () => {
      const complexFlow = new Flow<{ id: number }>({
        slug: 'complex-flow',
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

    it('should work with flows that have multiple steps with dependencies', () => {
      const multiStepFlow = new Flow<{ source: string }>({
        slug: 'multi-step-flow',
      })
        .step({ slug: 'extract' }, () => ({ parsed: { value: 123 } }))
        .step({ slug: 'transform', dependsOn: ['extract'] }, () => ({
          transformed: { multiplied: 246 },
        }))
        .step({ slug: 'load', dependsOn: ['transform'] }, () => ({
          success: true,
          recordId: 'abc123',
        }));

      // Test that StepOutput correctly extracts types from a flow with dependencies
      type ExtractOutput = StepOutput<typeof multiStepFlow, 'extract'>;
      type TransformOutput = StepOutput<typeof multiStepFlow, 'transform'>;
      type LoadOutput = StepOutput<typeof multiStepFlow, 'load'>;

      expectTypeOf<ExtractOutput>().toMatchTypeOf<{
        parsed: { value: number };
      }>();
      expectTypeOf<TransformOutput>().toMatchTypeOf<{
        transformed: { multiplied: number };
      }>();
      expectTypeOf<LoadOutput>().toMatchTypeOf<{
        success: boolean;
        recordId: string;
      }>();
    });
  });
});
