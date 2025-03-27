import { Flow, type StepOutput } from './dsl.ts';
import { describe, it, expectTypeOf, expect } from 'vitest';

it('should correctly type step handlers when using getStepDefinition', () => {
  const TestFlow = new Flow<{ url: string }>({ slug: 'test_flo' })
    .step({ slug: 'root_a' }, (input) =>
      [input.run.url, input.run.url].join(' ')
    )
    .step({ slug: 'root_b' }, (input) => input.run.url.length)
    .step({ slug: 'merge', dependsOn: ['root_a', 'root_b'] }, (input) => {
      return {
        a_val: input.root_a,
        b_val: input.root_b,
      };
    });

  const root_a = TestFlow.getStepDefinition('root_a');

  // Test root_a handler type
  expectTypeOf(root_a.handler).toBeFunction();
  expectTypeOf(root_a.handler).parameters.toEqualTypeOf<
    [{ run: { url: string } }]
  >();
  expectTypeOf(root_a.handler).returns.toEqualTypeOf<
    string | Promise<string>
  >();

  // Test root_b handler type
  const root_b = TestFlow.getStepDefinition('root_b');
  expectTypeOf(root_b.handler).toBeFunction();
  expectTypeOf(root_b.handler).parameters.toEqualTypeOf<
    [{ run: { url: string } }]
  >();
  expectTypeOf(root_b.handler).returns.toEqualTypeOf<
    number | Promise<number>
  >();

  // Test merge handler type
  const merge = TestFlow.getStepDefinition('merge');
  expectTypeOf(merge.handler).toBeFunction();
  expectTypeOf(merge.handler).parameters.toEqualTypeOf<
    [
      {
        run: { url: string };
        root_a: string;
        root_b: number;
      }
    ]
  >();
  expectTypeOf(merge.handler).returns.toEqualTypeOf<
    | {
        a_val: string;
        b_val: number;
      }
    | Promise<{
        a_val: string;
        b_val: number;
      }>
  >();

  // Test that dependencies are correctly set
  expect(root_a.dependencies).toEqual([]);
  expect(root_b.dependencies).toEqual([]);
  expect(merge.dependencies).toEqual(['root_a', 'root_b']);
});
