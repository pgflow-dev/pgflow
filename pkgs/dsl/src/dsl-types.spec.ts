import { Flow, type StepOutput } from './dsl.ts';
import { describe, it, expectTypeOf, expect } from 'vitest';

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
    const flow = new Flow<CountInput>({ slug: 'test-flow' })
      .step({ slug: 'step1' }, (payload) => {
        // Verify payload.run is typed correctly
        expectTypeOf(payload.run).toMatchTypeOf<CountInput>();
        return 84 as CountOutput;
      })
      .step({ slug: 'step2', dependsOn: ['step1'] }, (payload) => {
        // Verify payload contains step1 results
        expectTypeOf(payload.step1).toMatchTypeOf<CountOutput>();
        // Verify payload.run is still available
        expectTypeOf(payload.run).toMatchTypeOf<CountInput>();
        return 84 as CountOutput;
      });

    // Type-level verification of flow's step types
    type Steps = ReturnType<typeof flow.getSteps>;
    expectTypeOf<Steps['step1']['handler']>().toBeCallableWith({
      run: 42 as CountInput,
    });
    expectTypeOf<Steps['step2']['handler']>().toBeCallableWith({
      run: 42 as CountInput,
      step1: 84 as CountOutput,
    });
  });

  // Test dependsOn type constraints
  it('should not allow depending on non-existent steps', () => {
    const testFlow = new Flow<TextInput>({ slug: 'test-flow' }).step(
      { slug: 'step1' },
      () => 5 as TextLength
    );

    // @ts-expect-error - nonExistentStep doesn't exist
    testFlow.step(
      { slug: 'invalid', dependsOn: ['nonExistentStep'] },
      () => 0 as TextLength
    );
  });

  // Test payload access constraints
  it('should only allow access to dependencies declared in dependsOn', () => {
    const testFlow = new Flow<AccessInput>({ slug: 'test-flow' })
      .step({ slug: 'step1' }, () => 1 as AccessOutput1)
      .step({ slug: 'step2' }, () => 2 as AccessOutput2)
      .step({ slug: 'step3', dependsOn: ['step1'] }, (payload) => {
        // Valid access
        const val1 = payload.step1;

        // @ts-expect-error - step2 not declared in dependsOn
        const val2 = payload.step2;

        return val1;
      });
    // Just to avoid unused variable warning
    expect(testFlow).toBeDefined();
  });

  // Test more complex dependency chains
  it('should correctly type multi-level dependencies', () => {
    new Flow<TextInput>({ slug: 'test-flow' })
      .step({ slug: 'first' }, (_payload) => {
        return 5 as TextLength;
      })
      .step({ slug: 'second', dependsOn: ['first'] }, (_payload) => {
        return 10 as TextDoubled;
      })
      .step({ slug: 'third', dependsOn: ['first', 'second'] }, (payload) => {
        expectTypeOf(payload).toMatchTypeOf<{
          run: TextInput;
          first: TextLength;
          second: TextDoubled;
        }>();
        return 15 as TextCombined;
      });
  });

  // Test run payload accessibility
  it('should always include run payload in handler', () => {
    new Flow<FlagInput>({ slug: 'test-flow' })
      .step({ slug: 'step1' }, (payload) => {
        // Run should be accessible in all steps
        expectTypeOf(payload.run).toMatchTypeOf<FlagInput>();
        return false as FlagOutput;
      })
      .step({ slug: 'step2', dependsOn: ['step1'] }, (payload) => {
        // Run should still be accessible even with dependencies
        expectTypeOf(payload.run).toMatchTypeOf<FlagInput>();
        expectTypeOf(payload.step1).toMatchTypeOf<FlagOutput>();
        return 0 as FlagNumeric;
      });
  });

  // Tests for getSteps() handler type preservation
  describe('getSteps() handler type preservation', () => {
    it('should preserve handler argument types from run input and dependencies', () => {
      // Define a flow with specific input and output types
      type RunInput = { userId: number; action: string };

      const flow = new Flow<RunInput>({ slug: 'handler-type-test' })
        .step({ slug: 'step1' }, (payload) => {
          // Verify run input type
          expectTypeOf(payload.run).toMatchTypeOf<RunInput>();
          return { count: 42, status: 'processed' };
        })
        .step({ slug: 'step2', dependsOn: ['step1'] }, (payload) => {
          // Verify both run input and step1 output types
          expectTypeOf(payload.run).toMatchTypeOf<RunInput>();
          expectTypeOf(payload.step1).toMatchTypeOf<{
            count: number;
            status: string;
          }>();
          return { success: true };
        });

      // Get the steps and verify handler argument types
      const steps = flow.getSteps();

      // Extract the handler types
      type Step1HandlerArgType = Parameters<typeof steps.step1.handler>[0];
      type Step2HandlerArgType = Parameters<typeof steps.step2.handler>[0];

      // Verify step1 handler argument type includes run input
      expectTypeOf<Step1HandlerArgType>().toMatchTypeOf<{
        run: RunInput;
      }>();

      // Verify step2 handler argument type includes both run input and step1 output
      expectTypeOf<Step2HandlerArgType>().toMatchTypeOf<{
        run: RunInput;
        step1: { count: number; status: string };
      }>();
    });
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
