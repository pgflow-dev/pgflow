import { ExtractFlowOutput, StepOutput, Flow } from '../../src/index.js';
import { describe, it, expectTypeOf } from 'vitest';

describe('ExtractFlowOutput utility type', () => {
  it('should return an empty object for a flow without steps', () => {
    // Use type assertion to avoid unused variable warning
    const emptyFlow = new Flow({ slug: 'empty_flow' });
    // Use a type-only variable to avoid the unused variable warning
    type EmptyFlowType = typeof emptyFlow;

    type FlowOutput = ExtractFlowOutput<EmptyFlowType>;

    // For an empty flow, output is an empty object
    // Using Record<never, never> instead of {} to avoid ESLint error
    expectTypeOf<FlowOutput>().toEqualTypeOf<Record<never, never>>();
    expectTypeOf<keyof FlowOutput>().toEqualTypeOf<never>();
  });

  it('should correctly output for a flow with a single leaf step', () => {
    const singleStepFlow = new Flow<{ input: string }>({
      slug: 'single_step_flow',
    }).step({ slug: 'process' }, (flowInput) => ({
      result: flowInput.input.toUpperCase(),
    }));

    type SingleStepFlowType = typeof singleStepFlow;

    type FlowOutput = ExtractFlowOutput<SingleStepFlowType>;

    // The only leaf step is "process", whose output type is StepOutput<typeof singleStepFlow, 'process'>
    expectTypeOf<FlowOutput>().toMatchTypeOf<{
      process: StepOutput<SingleStepFlowType, 'process'>;
    }>();

    // The value for process in output should match its StepOutput type
    expectTypeOf<FlowOutput['process']>().toEqualTypeOf<{ result: string }>();

    // FlowOutput should not have other keys
    expectTypeOf<FlowOutput>().not.toMatchTypeOf<{
      nonExistentStep: unknown;
    }>();
  });

  it('should correctly output for multiple leaf steps', () => {
    const multiLeafFlow = new Flow<{ data: number }>({
      slug: 'multi_leaf_flow',
    })
      .step({ slug: 'intermediate' }, (flowInput) => ({
        value: flowInput.data * 2,
      }))
      .step({ slug: 'leaf1', dependsOn: ['intermediate'] }, (deps) => ({
        squared: deps.intermediate.value ** 2,
      }))
      .step({ slug: 'leaf2', dependsOn: ['intermediate'] }, (deps) => ({
        doubled: deps.intermediate.value * 2,
      }));

    type FlowOutput = ExtractFlowOutput<typeof multiLeafFlow>;

    // FlowOutput should have exactly leaf1 and leaf2, each with their respective StepOutputs
    expectTypeOf<FlowOutput>().toMatchTypeOf<{
      leaf1: StepOutput<typeof multiLeafFlow, 'leaf1'>;
      leaf2: StepOutput<typeof multiLeafFlow, 'leaf2'>;
    }>();

    expectTypeOf<FlowOutput['leaf1']>().toEqualTypeOf<{ squared: number }>();
    expectTypeOf<FlowOutput['leaf2']>().toEqualTypeOf<{ doubled: number }>();

    // Should NOT have intermediate
    expectTypeOf<FlowOutput>().not.toMatchTypeOf<{
      intermediate: unknown;
    }>();
  });

  it('should correctly handle a root step that is also a leaf step', () => {
    const rootLeafFlow = new Flow<{ input: string }>({ slug: 'root_leaf_flow' })
      .step({ slug: 'rootLeaf' }, (flowInput) => ({
        processed: flowInput.input.trim(),
      }))
      .step({ slug: 'intermediate' }, (flowInput) => ({
        length: flowInput.input.length,
      }))
      .step({ slug: 'dependent', dependsOn: ['intermediate'] }, (deps) => ({
        result: deps.intermediate.length > 10,
      }));

    type FlowOutput = ExtractFlowOutput<typeof rootLeafFlow>;

    expectTypeOf<FlowOutput>().toMatchTypeOf<{
      rootLeaf: StepOutput<typeof rootLeafFlow, 'rootLeaf'>;
      dependent: StepOutput<typeof rootLeafFlow, 'dependent'>;
    }>();

    expectTypeOf<FlowOutput['rootLeaf']>().toEqualTypeOf<{
      processed: string;
    }>();
    expectTypeOf<FlowOutput['dependent']>().toEqualTypeOf<{
      result: boolean;
    }>();

    expectTypeOf<FlowOutput>().not.toMatchTypeOf<{
      intermediate: unknown;
    }>();
  });

  it('should handle complex dependency chains', () => {
    const complexFlow = new Flow<{ input: number }>({ slug: 'complex_flow' })
      .step({ slug: 'step1' }, (flowInput) => ({ value: flowInput.input + 1 }))
      .step({ slug: 'step2', dependsOn: ['step1'] }, (deps) => ({
        value: deps.step1.value * 2,
      }))
      .step({ slug: 'step3', dependsOn: ['step1'] }, (deps) => ({
        value: deps.step1.value - 1,
      }))
      .step(
        { slug: 'step4', dependsOn: ['step2', 'step3'] },
        async (deps, ctx) => {
          const flowInput = await ctx.flowInput;
          return {
            sum: deps.step2.value + deps.step3.value,
            original: flowInput.input,
          };
        }
      );

    type FlowOutput = ExtractFlowOutput<typeof complexFlow>;

    expectTypeOf<FlowOutput>().toMatchTypeOf<{
      step4: StepOutput<typeof complexFlow, 'step4'>;
    }>();

    expectTypeOf<FlowOutput['step4']>().toEqualTypeOf<{
      sum: number;
      original: number;
    }>();

    // No extras
    expectTypeOf<FlowOutput>().not.toMatchTypeOf<{
      step1: unknown;
      step2: unknown;
      step3: unknown;
    }>();
  });

  it('makes skippable leaf steps optional in flow output', () => {
    const skippableLeafFlow = new Flow<{ input: string }>({
      slug: 'skippable_leaf_flow',
    })
      .step({ slug: 'prepare' }, (flowInput) => ({ text: flowInput.input }))
      .step(
        {
          slug: 'leaf_optional',
          dependsOn: ['prepare'],
          if: { prepare: { text: 'run' } },
          whenUnmet: 'skip',
        },
        (deps) => ({ value: deps.prepare.text.toUpperCase() })
      );

    type FlowOutput = ExtractFlowOutput<typeof skippableLeafFlow>;

    expectTypeOf<FlowOutput>().toMatchTypeOf<{
      leaf_optional?: StepOutput<typeof skippableLeafFlow, 'leaf_optional'>;
    }>();

    expectTypeOf<{
      leaf_optional?: StepOutput<typeof skippableLeafFlow, 'leaf_optional'>;
    }>().toMatchTypeOf<FlowOutput>();
  });

  it('keeps non-skippable leaf steps required in flow output', () => {
    const requiredLeafFlow = new Flow<{ input: string }>({
      slug: 'required_leaf_flow',
    }).step({ slug: 'leaf_required' }, (flowInput) => ({
      value: flowInput.input.length,
    }));

    type FlowOutput = ExtractFlowOutput<typeof requiredLeafFlow>;

    expectTypeOf<FlowOutput>().toMatchTypeOf<{
      leaf_required: StepOutput<typeof requiredLeafFlow, 'leaf_required'>;
    }>();

    expectTypeOf<{
      leaf_required: StepOutput<typeof requiredLeafFlow, 'leaf_required'>;
    }>().toMatchTypeOf<FlowOutput>();
  });

  it('supports mixed required and skippable leaf outputs', () => {
    const mixedLeafFlow = new Flow<{ input: string }>({
      slug: 'mixed_leaf_flow',
    })
      .step({ slug: 'prepare' }, (flowInput) => ({ text: flowInput.input }))
      .step({ slug: 'required_leaf', dependsOn: ['prepare'] }, (deps) => ({
        value: deps.prepare.text.length,
      }))
      .step(
        {
          slug: 'optional_leaf',
          dependsOn: ['prepare'],
          if: { prepare: { text: 'run' } },
          whenUnmet: 'skip-cascade',
        },
        (deps) => ({ value: deps.prepare.text.toUpperCase() })
      );

    type FlowOutput = ExtractFlowOutput<typeof mixedLeafFlow>;

    expectTypeOf<FlowOutput>().toMatchTypeOf<{
      required_leaf: StepOutput<typeof mixedLeafFlow, 'required_leaf'>;
      optional_leaf?: StepOutput<typeof mixedLeafFlow, 'optional_leaf'>;
    }>();

    expectTypeOf<{
      required_leaf: StepOutput<typeof mixedLeafFlow, 'required_leaf'>;
      optional_leaf?: StepOutput<typeof mixedLeafFlow, 'optional_leaf'>;
    }>().toMatchTypeOf<FlowOutput>();
  });

  it('preserves optional inner keys for required leaf outputs', () => {
    const requiredOptionalInnerFlow = new Flow<{ input: string }>({
      slug: 'required_optional_inner_flow',
    }).step({ slug: 'leaf_required' }, (): { entryId?: string } =>
      Math.random() > 0.5 ? { entryId: 'entry-1' } : {}
    );

    type FlowOutput = ExtractFlowOutput<typeof requiredOptionalInnerFlow>;

    expectTypeOf<FlowOutput>().toMatchTypeOf<{
      leaf_required: { entryId?: string };
    }>();
    expectTypeOf<{
      leaf_required: { entryId?: string };
    }>().toMatchTypeOf<FlowOutput>();
  });

  it('supports optional outer key with optional inner keys for skippable leaves', () => {
    const skippableOptionalInnerFlow = new Flow<{ input: string }>({
      slug: 'skippable_optional_inner_flow',
    })
      .step({ slug: 'prepare' }, (flowInput) => ({ text: flowInput.input }))
      .step(
        {
          slug: 'leaf_optional',
          dependsOn: ['prepare'],
          if: { prepare: { text: 'run' } },
          whenUnmet: 'skip',
        },
        (): { meta?: { tag: string } } =>
          Math.random() > 0.5 ? { meta: { tag: 'ok' } } : {}
      );

    type FlowOutput = ExtractFlowOutput<typeof skippableOptionalInnerFlow>;

    expectTypeOf<FlowOutput>().toMatchTypeOf<{
      leaf_optional?: { meta?: { tag: string } };
    }>();
    expectTypeOf<{
      leaf_optional?: { meta?: { tag: string } };
    }>().toMatchTypeOf<FlowOutput>();
  });
});
