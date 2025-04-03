import { Flow, type ExtractFlowSteps } from '../../src/index.ts';
import { describe, it, expectTypeOf } from 'vitest';

describe('ExtractFlowSteps utility type', () => {
  it('should correctly extract steps from a flow with defined input', () => {
    const flow = new Flow<{ userId: number }>({ slug: 'user_flow' })
      .step({ slug: 'fetchUser' }, () => ({ name: 'John', age: 30 }))
      .step({ slug: 'fetchPosts', dependsOn: ['fetchUser'] }, () => [
        { id: 1, title: 'Hello World' },
        { id: 2, title: 'TypeScript is Fun' },
      ]);

    type Steps = ExtractFlowSteps<typeof flow>;

    expectTypeOf<Steps>().toMatchTypeOf<{
      fetchUser: { name: string; age: number };
      fetchPosts: Array<{ id: number; title: string }>;
    }>();

    // ensure it doesn't extract non-existent fields
    expectTypeOf<Steps>().not.toMatchTypeOf<{
      nonExistentStep: number;
    }>();
  });

  it('should work with AnyFlow to extract steps from a generic flow', () => {
    const anyFlow = new Flow({ slug: 'any_flow' })
      .step({ slug: 'step1' }, () => 42)
      .step({ slug: 'step2' }, () => 'string value')
      .step({ slug: 'step3' }, () => ({ complex: { nested: true } }));

    type Steps = ExtractFlowSteps<typeof anyFlow>;

    expectTypeOf<Steps>().toMatchTypeOf<{
      step1: number;
      step2: string;
      step3: { complex: { nested: boolean } };
    }>();

    // ensure it doesn't extract non-existent fields
    expectTypeOf<Steps>().not.toMatchTypeOf<{
      nonExistentStep: number;
    }>();
  });

  it('should handle empty steps correctly', () => {
    const emptyFlow = new Flow({ slug: 'empty_flow' });
    type Steps = ExtractFlowSteps<typeof emptyFlow>;

    expectTypeOf<Steps>().toEqualTypeOf<Record<never, never>>();
  });

  it('should extract steps with primitive return types', () => {
    const primitiveFlow = new Flow({ slug: 'primitive_flow' })
      .step({ slug: 'numberStep' }, () => 123)
      .step({ slug: 'stringStep' }, () => 'text')
      .step({ slug: 'booleanStep' }, () => true)
      .step({ slug: 'nullStep' }, () => null);

    type Steps = ExtractFlowSteps<typeof primitiveFlow>;

    expectTypeOf<Steps>().toMatchTypeOf<{
      numberStep: number;
      stringStep: string;
      booleanStep: boolean;
      nullStep: null;
    }>();

    // ensure it doesn't extract non-existent fields
    expectTypeOf<Steps>().not.toMatchTypeOf<{
      nonExistentStep: number;
    }>();
  });
});
