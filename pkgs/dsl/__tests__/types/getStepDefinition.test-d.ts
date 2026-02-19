import { Flow } from '../../src/index.js';
import { it, expectTypeOf, expect } from 'vitest';

it('should correctly type step handlers when using getStepDefinition', () => {
  const TestFlow = new Flow<{ url: string }>({ slug: 'test_flo' })
    .step({ slug: 'root_a' }, (flowInput) =>
      [flowInput.url, flowInput.url].join(' ')
    )
    .step({ slug: 'root_b' }, (flowInput) => flowInput.url.length)
    .step({ slug: 'merge', dependsOn: ['root_a', 'root_b'] }, (deps) => {
      return {
        a_val: deps.root_a,
        b_val: deps.root_b,
      };
    });

  const root_a = TestFlow.getStepDefinition('root_a');

  // Test root_a handler type - root steps receive flowInput directly (no run key)
  expectTypeOf(root_a.handler).toBeFunction();
  expectTypeOf(root_a.handler).parameters.toMatchTypeOf<
    [{ url: string }, any]
  >();
  expectTypeOf(root_a.handler).returns.toMatchTypeOf<
    string | Promise<string>
  >();

  // Test root_b handler type
  const root_b = TestFlow.getStepDefinition('root_b');
  expectTypeOf(root_b.handler).toBeFunction();
  expectTypeOf(root_b.handler).parameters.toMatchTypeOf<
    [{ url: string }, any]
  >();
  expectTypeOf(root_b.handler).returns.toMatchTypeOf<
    number | Promise<number>
  >();

  // Test merge handler type - dependent steps receive deps only (no run key)
  const merge = TestFlow.getStepDefinition('merge');
  expectTypeOf(merge.handler).toBeFunction();
  expectTypeOf(merge.handler).parameters.toMatchTypeOf<
    [
      {
        root_a: string;
        root_b: number;
      },
      any
    ]
  >();
  expectTypeOf(merge.handler).returns.toMatchTypeOf<
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

it('should make only skip dependencies optional in getStepDefinition handler input', () => {
  const flow = new Flow<{ flag: boolean }>({ slug: 'dep_typing' })
    .step(
      { slug: 'skip_dep', if: { flag: true }, whenUnmet: 'skip' },
      () => 'skip'
    )
    .step(
      { slug: 'cascade_dep', if: { flag: true }, whenUnmet: 'skip-cascade' },
      () => 'cascade'
    )
    .step({ slug: 'required_dep' }, () => 42)
    .step(
      { slug: 'uses_skip', dependsOn: ['skip_dep', 'required_dep'] },
      (deps) => {
        expectTypeOf(deps).toEqualTypeOf<{
          skip_dep?: string;
          required_dep: number;
        }>();
        return deps.required_dep;
      }
    )
    .step(
      { slug: 'uses_cascade', dependsOn: ['cascade_dep', 'required_dep'] },
      (deps) => {
        expectTypeOf(deps).toEqualTypeOf<{
          cascade_dep: string;
          required_dep: number;
        }>();
        return deps.required_dep;
      }
    );

  const usesSkip = flow.getStepDefinition('uses_skip');
  type UsesSkipInput = Parameters<typeof usesSkip.handler>[0];
  expectTypeOf<UsesSkipInput>().toEqualTypeOf<{
    skip_dep?: string;
    required_dep: number;
  }>();

  const usesCascade = flow.getStepDefinition('uses_cascade');
  type UsesCascadeInput = Parameters<typeof usesCascade.handler>[0];
  expectTypeOf<UsesCascadeInput>().toEqualTypeOf<{
    cascade_dep: string;
    required_dep: number;
  }>();
});

it('should treat omitted whenUnmet with conditions as skip in getStepDefinition types', () => {
  const flow = new Flow<{ active: boolean }>({ slug: 'default_when_unmet' })
    .step({ slug: 'conditioned', if: { active: true } }, () => 'ok')
    .step({ slug: 'consumer', dependsOn: ['conditioned'] }, (deps) => {
      expectTypeOf(deps).toEqualTypeOf<{ conditioned?: string }>();
      return deps.conditioned ?? 'fallback';
    });

  const consumer = flow.getStepDefinition('consumer');
  type ConsumerInput = Parameters<typeof consumer.handler>[0];
  expectTypeOf<ConsumerInput>().toEqualTypeOf<{ conditioned?: string }>();
});
