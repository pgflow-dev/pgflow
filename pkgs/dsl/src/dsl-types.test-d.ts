import { Flow } from './dsl.ts';
import { it, expectTypeOf } from 'vitest';

// Utility types for checking exact key matching
type ExactKeys<T, U> = keyof T extends keyof U
  ? keyof U extends keyof T
    ? true
    : false
  : false;

// Type that will only be true if T and U have exactly the same keys
type HasExactKeys<T, U> = ExactKeys<T, U> extends true ? true : false;

it('properly types input argument for root steps', () => {
  new Flow<{ id: number; email: string }>({
    slug: 'test_flow',
  }).step({ slug: 'root_a' }, (input) => {
    expectTypeOf(input).toMatchTypeOf<{ run: { id: number; email: string } }>();
    expectTypeOf(input).not.toMatchTypeOf<{ nonexistent_dep: string }>();
    return { result: 'test-result' };
  });
});

it('properly types input argument for dependent steps', () => {
  new Flow<{ id: number; email: string }>({
    slug: 'test_flow',
  })
    .step({ slug: 'root_a' }, (input) => Object.values(input.run).length)
    .step({ slug: 'step_a', dependsOn: ['root_a'] }, (input) =>
      Object.values(input).join(',')
    )
    .step({ slug: 'final_step', dependsOn: ['root_a', 'step_a'] }, (input) => {
      const { run, root_a, step_a } = input;

      // Check individual properties
      expectTypeOf(run).toEqualTypeOf<{ id: number; email: string }>();
      expectTypeOf(root_a).toEqualTypeOf<number>();
      expectTypeOf(step_a).toEqualTypeOf<string>();

      return true;
    });
});

it('ensures input has exactly the expected keys', () => {
  new Flow<{ id: number; email: string }>({
    slug: 'test_flow',
  })
    .step({ slug: 'root_a' }, (input) => Object.values(input.run).length)
    .step({ slug: 'step_a', dependsOn: ['root_a'] }, (input) =>
      Object.values(input).join(',')
    )
    .step({ slug: 'final_step', dependsOn: ['root_a', 'step_a'] }, (input) => {
      // Define the expected shape of the input
      type ExpectedInput = {
        run: { id: number; email: string };
        root_a: number;
        step_a: string;
      };

      // Check that the input type has exactly the same keys as ExpectedInput
      type Result = HasExactKeys<typeof input, ExpectedInput>;

      // This will fail if input has extra or missing keys compared to ExpectedInput
      expectTypeOf<Result>().toEqualTypeOf<true>();

      // Another approach: check that the keys are exactly the same
      expectTypeOf<keyof typeof input>().toEqualTypeOf<keyof ExpectedInput>();

      // Check that we can't access any non-existent property
      // @ts-expect-error - This should fail type checking
      const nonExistent = input.nonExistentProperty;

      return true;
    });
});
