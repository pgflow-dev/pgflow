import { Flow, type StepOutput, type StepInput } from './dsl.ts';
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
        expectTypeOf(payload.run).toBeNumber();
        return 84 as CountOutput;
      })
      .step({ slug: 'step2', dependsOn: ['step1'] }, (payload) => {
        // Verify payload contains step1 results
        expectTypeOf(payload.step1).toBeNumber();
        // Verify payload.run is still available
        expectTypeOf(payload.run).toBeNumber();
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

    // This should cause a type error because nonExistentStep doesn't exist
    testFlow.step(
      // @ts-expect-error - nonExistentStep doesn't exist in the flow
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

        // @ts-expect-error - step2 is not declared in dependsOn
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
        expectTypeOf(payload).toBeObject();
        expectTypeOf(payload).toHaveProperty('run').toBeString();
        expectTypeOf(payload).toHaveProperty('first').toBeNumber();
        expectTypeOf(payload).toHaveProperty('second').toBeNumber();
        return 15 as TextCombined;
      });
  });

  // Test run payload accessibility
  it('should always include run payload in handler', () => {
    new Flow<FlagInput>({ slug: 'test-flow' })
      .step({ slug: 'step1' }, (payload) => {
        // Run should be accessible in all steps
        expectTypeOf(payload.run).toBeBoolean();
        return false as FlagOutput;
      })
      .step({ slug: 'step2', dependsOn: ['step1'] }, (payload) => {
        // Run should still be accessible even with dependencies
        expectTypeOf(payload.run).toBeBoolean();
        expectTypeOf(payload.step1).toBeBoolean();
        return 0 as FlagNumeric;
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
      expectTypeOf<Step1Output>().toBeObject();
      expectTypeOf<Step1Output>().toHaveProperty('value').toBeNumber();
      expectTypeOf<Step1Output>().toHaveProperty('text').toBeString();

      // Test StepOutput with step2
      type Step2Output = StepOutput<typeof flow, 'step2'>;
      expectTypeOf<Step2Output>().toBeObject();
      expectTypeOf<Step2Output>().toHaveProperty('flag').toBeBoolean();

      // Test StepOutput with step3
      type Step3Output = StepOutput<typeof flow, 'step3'>;
      expectTypeOf<Step3Output>().toBeString();

      // Test StepOutput with non-existent step
      type NonExistentStepOutput = StepOutput<typeof flow, 'nonExistentStep'>;
      expectTypeOf<NonExistentStepOutput>().toBeNever();
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
      expectTypeOf<ComplexStepOutput>().toBeObject();
      expectTypeOf<ComplexStepOutput>().toHaveProperty('data').toBeObject();
      expectTypeOf<ComplexStepOutput>()
        .toHaveProperty('data')
        .toHaveProperty('items')
        .toBeArray();
      expectTypeOf<ComplexStepOutput>()
        .toHaveProperty('data')
        .toHaveProperty('metadata')
        .toBeObject();
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

      expectTypeOf<ExtractOutput>().toBeObject();
      expectTypeOf<ExtractOutput>().toHaveProperty('parsed').toBeObject();

      expectTypeOf<TransformOutput>().toBeObject();
      expectTypeOf<TransformOutput>()
        .toHaveProperty('transformed')
        .toBeObject();

      expectTypeOf<LoadOutput>().toBeObject();
      expectTypeOf<LoadOutput>().toHaveProperty('success').toBeBoolean();
      expectTypeOf<LoadOutput>().toHaveProperty('recordId').toBeString();
    });

    // Tests for StepInput utility type
    describe('StepInput utility type', () => {
      it('should correctly extract the input type of a step', () => {
        const flow = new Flow<{ input: string }>({ slug: 'step-input-test' })
          .step({ slug: 'step1' }, (payload) => ({
            value: payload.run.input.length,
            text: 'hello',
          }))
          .step({ slug: 'step2', dependsOn: ['step1'] }, (payload) => ({
            flag: payload.step1.value > 5,
          }));

        // Test StepInput with step1
        type Step1Input = StepInput<typeof flow, 'step1'>;
        expectTypeOf<Step1Input>().toBeObject();
        expectTypeOf<Step1Input>().toHaveProperty('run').toBeObject();
        expectTypeOf<Step1Input>()
          .toHaveProperty('run')
          .toHaveProperty('input')
          .toBeString();

        // Test StepInput with step2
        type Step2Input = StepInput<typeof flow, 'step2'>;
        expectTypeOf<Step2Input>().toBeObject();
        expectTypeOf<Step2Input>().toHaveProperty('run').toBeObject();
        expectTypeOf<Step2Input>().toHaveProperty('step1').toBeObject();

        // Test StepInput with non-existent step
        type NonExistentStepInput = StepInput<typeof flow, 'nonExistentStep'>;
        expectTypeOf<NonExistentStepInput>().toBeNever();
      });

      it('should work with complex dependency chains', () => {
        const complexFlow = new Flow<{ userId: number }>({
          slug: 'complex-dependency-flow',
        })
          .step({ slug: 'fetchUser' }, (payload) => ({
            user: { id: payload.run.userId, name: 'User Name' },
          }))
          .step(
            { slug: 'fetchPosts', dependsOn: ['fetchUser'] },
            (payload) => ({
              posts: [
                { id: 1, title: 'Post 1', authorId: payload.fetchUser.user.id },
                { id: 2, title: 'Post 2', authorId: payload.fetchUser.user.id },
              ],
            })
          )
          .step(
            { slug: 'processData', dependsOn: ['fetchUser', 'fetchPosts'] },
            (payload) => ({
              result: {
                userName: payload.fetchUser.user.name,
                postCount: payload.fetchPosts.posts.length,
              },
            })
          );

        // Test input types for each step
        type FetchUserInput = StepInput<typeof complexFlow, 'fetchUser'>;
        type FetchPostsInput = StepInput<typeof complexFlow, 'fetchPosts'>;
        type ProcessDataInput = StepInput<typeof complexFlow, 'processData'>;

        expectTypeOf<FetchUserInput>().toBeObject();
        expectTypeOf<FetchUserInput>().toHaveProperty('run').toBeObject();
        expectTypeOf<FetchUserInput>()
          .toHaveProperty('run')
          .toHaveProperty('userId')
          .toBeNumber();

        expectTypeOf<FetchPostsInput>().toBeObject();
        expectTypeOf<FetchPostsInput>().toHaveProperty('run').toBeObject();
        expectTypeOf<FetchPostsInput>()
          .toHaveProperty('fetchUser')
          .toBeObject();

        expectTypeOf<ProcessDataInput>().toBeObject();
        expectTypeOf<ProcessDataInput>().toHaveProperty('run').toBeObject();
        expectTypeOf<ProcessDataInput>()
          .toHaveProperty('fetchUser')
          .toBeObject();
        expectTypeOf<ProcessDataInput>()
          .toHaveProperty('fetchPosts')
          .toBeObject();
      });

      it('should handle primitive return types in dependencies', () => {
        const mixedFlow = new Flow<{ value: number }>({
          slug: 'mixed-types-flow',
        })
          .step({ slug: 'double' }, (payload) => payload.run.value * 2)
          .step({ slug: 'stringify', dependsOn: ['double'] }, (payload) =>
            String(payload.double)
          )
          .step(
            { slug: 'combine', dependsOn: ['double', 'stringify'] },
            (payload) => ({
              numeric: payload.double,
              text: payload.stringify,
            })
          );

        // Test input types
        type DoubleInput = StepInput<typeof mixedFlow, 'double'>;
        type StringifyInput = StepInput<typeof mixedFlow, 'stringify'>;
        type CombineInput = StepInput<typeof mixedFlow, 'combine'>;

        expectTypeOf<DoubleInput>().toBeObject();
        expectTypeOf<DoubleInput>().toHaveProperty('run').toBeObject();
        expectTypeOf<DoubleInput>()
          .toHaveProperty('run')
          .toHaveProperty('value')
          .toBeNumber();

        expectTypeOf<StringifyInput>().toBeObject();
        expectTypeOf<StringifyInput>().toHaveProperty('run').toBeObject();
        expectTypeOf<StringifyInput>().toHaveProperty('double').toBeNumber();

        expectTypeOf<CombineInput>().toBeObject();
        expectTypeOf<CombineInput>().toHaveProperty('run').toBeObject();
        expectTypeOf<CombineInput>().toHaveProperty('double').toBeNumber();
        expectTypeOf<CombineInput>().toHaveProperty('stringify').toBeString();
      });
    });
  });
});
