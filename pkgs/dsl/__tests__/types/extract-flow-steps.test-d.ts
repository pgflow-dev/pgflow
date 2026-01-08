import { Flow, type ExtractFlowSteps, type StepOutput } from '../../src/index.js';
import { describe, it, expectTypeOf } from 'vitest';

// ExtractFlowSteps returns step slugs as keys
// Use StepOutput<> to get the output type from a step
describe('ExtractFlowSteps utility type', () => {
  it('should correctly extract step slugs from a flow', () => {
    const flow = new Flow<{ userId: number }>({ slug: 'user_flow' })
      .step({ slug: 'fetchUser' }, () => ({ name: 'John', age: 30 }))
      .step({ slug: 'fetchPosts', dependsOn: ['fetchUser'] }, () => [
        { id: 1, title: 'Hello World' },
        { id: 2, title: 'TypeScript is Fun' },
      ]);

    type Steps = ExtractFlowSteps<typeof flow>;

    // Keys are step slugs
    expectTypeOf<keyof Steps>().toEqualTypeOf<'fetchUser' | 'fetchPosts'>();

    // Use StepOutput to get output types (public API)
    expectTypeOf<StepOutput<typeof flow, 'fetchUser'>>().toMatchTypeOf<{
      name: string;
      age: number;
    }>();
    expectTypeOf<StepOutput<typeof flow, 'fetchPosts'>>().toMatchTypeOf<
      Array<{ id: number; title: string }>
    >();
  });

  it('should work with AnyFlow to extract steps from a generic flow', () => {
    const anyFlow = new Flow({ slug: 'any_flow' })
      .step({ slug: 'step1' }, () => 42)
      .step({ slug: 'step2' }, () => 'string value')
      .step({ slug: 'step3' }, () => ({ complex: { nested: true } }));

    type Steps = ExtractFlowSteps<typeof anyFlow>;

    // Keys are step slugs
    expectTypeOf<keyof Steps>().toEqualTypeOf<'step1' | 'step2' | 'step3'>();

    // Use StepOutput to verify output types
    expectTypeOf<StepOutput<typeof anyFlow, 'step1'>>().toEqualTypeOf<number>();
    expectTypeOf<StepOutput<typeof anyFlow, 'step2'>>().toEqualTypeOf<string>();
    expectTypeOf<StepOutput<typeof anyFlow, 'step3'>>().toMatchTypeOf<{
      complex: { nested: boolean };
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

    // Keys are step slugs
    expectTypeOf<keyof Steps>().toEqualTypeOf<
      'numberStep' | 'stringStep' | 'booleanStep' | 'nullStep'
    >();

    // Use StepOutput to verify output types
    expectTypeOf<StepOutput<typeof primitiveFlow, 'numberStep'>>().toEqualTypeOf<number>();
    expectTypeOf<StepOutput<typeof primitiveFlow, 'stringStep'>>().toEqualTypeOf<string>();
    expectTypeOf<StepOutput<typeof primitiveFlow, 'booleanStep'>>().toEqualTypeOf<boolean>();
    expectTypeOf<StepOutput<typeof primitiveFlow, 'nullStep'>>().toEqualTypeOf<null>();
  });
});
