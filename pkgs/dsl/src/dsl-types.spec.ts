import { Flow } from './dsl.ts';
import { describe, it, expectTypeOf, expect } from 'vitest';

// Define distinct literal types for each test case
// First test case types
type CountInput = 42;
type CountOutput = 84;

// Second test case types
type TextInput = "hello";
type TextLength = 5;
type TextDoubled = 10;
type TextCombined = 15;

// Third test case types
type FlagInput = true;
type FlagOutput = false;
type FlagNumeric = 0;

// Fourth test case types
type AccessInput = "access";
type AccessOutput1 = 1;
type AccessOutput2 = 2;

describe('Flow Type Safety', () => {
  // Test basic flow setup and type inference
  it('should correctly type the payload based on dependsOn', () => {
    const flow = new Flow<CountInput>({ slug: 'test-flow' })
      .step(
        { slug: 'step1' },
        (payload) => {
          // Verify payload.run is typed correctly
          expectTypeOf(payload.run).toMatchTypeOf<CountInput>();
          return 84 as CountOutput;
        }
      )
      .step(
        { slug: 'step2', dependsOn: ['step1'] },
        (payload) => {
          // Verify payload contains step1 results
          expectTypeOf(payload.step1).toMatchTypeOf<CountOutput>();
          // Verify payload.run is still available
          expectTypeOf(payload.run).toMatchTypeOf<CountInput>();
          return 84 as CountOutput;
        }
      );

    // Type-level verification of flow's step types
    type Steps = ReturnType<typeof flow.getSteps>;
    expectTypeOf<Steps['step1']['handler']>().toBeCallableWith({ run: 42 as CountInput });
    expectTypeOf<Steps['step2']['handler']>().toBeCallableWith({ run: 42 as CountInput, step1: 84 as CountOutput });
  });

  // Test dependsOn type constraints
  it('should not allow depending on non-existent steps', () => {
    const testFlow = new Flow<TextInput>({ slug: 'test-flow' })
      .step({ slug: 'step1' }, () => 5 as TextLength);

    // @ts-expect-error - nonExistentStep doesn't exist
    testFlow.step({ slug: 'invalid', dependsOn: ['nonExistentStep'] }, () => 0 as TextLength);
  });

  // Test payload access constraints
  it('should only allow access to dependencies declared in dependsOn', () => {
    const testFlow = new Flow<AccessInput>({ slug: 'test-flow' })
      .step({ slug: 'step1' }, () => 1 as AccessOutput1)
      .step({ slug: 'step2' }, () => 2 as AccessOutput2)
      .step(
        { slug: 'step3', dependsOn: ['step1'] },
        (payload) => {
          // Valid access
          const val1 = payload.step1;

          // @ts-expect-error - step2 not declared in dependsOn
          const val2 = payload.step2;

          return val1;
        }
      );
    // Just to avoid unused variable warning
    expect(testFlow).toBeDefined();
  });

  // Test more complex dependency chains
  it('should correctly type multi-level dependencies', () => {
    new Flow<TextInput>({ slug: 'test-flow' })
      .step(
        { slug: 'first' },
        (_payload) => {
          return 5 as TextLength
        }
      )
      .step(
        { slug: 'second', dependsOn: ['first'] },
        (_payload) => {
          return 10 as TextDoubled
        }
      )
      .step(
        { slug: 'third', dependsOn: ['first', 'second'] },
        (payload) => {
          expectTypeOf(payload).toMatchTypeOf<{
            run: TextInput;
            first: TextLength;
            second: TextDoubled;
          }>();
          return 15 as TextCombined;
        }
      );
  });

  // Test run payload accessibility
  it('should always include run payload in handler', () => {
    new Flow<FlagInput>({ slug: 'test-flow' })
      .step(
        { slug: 'step1' },
        (payload) => {
          // Run should be accessible in all steps
          expectTypeOf(payload.run).toMatchTypeOf<FlagInput>();
          return false as FlagOutput;
        }
      )
      .step(
        { slug: 'step2', dependsOn: ['step1'] },
        (payload) => {
          // Run should still be accessible even with dependencies
          expectTypeOf(payload.run).toMatchTypeOf<FlagInput>();
          expectTypeOf(payload.step1).toMatchTypeOf<FlagOutput>();
          return 0 as FlagNumeric;
        }
      );
  });
});
