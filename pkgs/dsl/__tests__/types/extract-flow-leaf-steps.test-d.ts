import { ExtractFlowLeafSteps, Flow } from '../../src/index.js';
import { describe, it, expectTypeOf } from 'vitest';

describe('ExtractFlowLeafSteps utility type', () => {
  it('should return never for a flow without steps', () => {
    const emptyFlow = new Flow({ slug: 'empty_flow' });

    type LeafSteps = ExtractFlowLeafSteps<typeof emptyFlow>;

    // A flow without steps should have no leaf steps
    expectTypeOf<LeafSteps>().toEqualTypeOf({});
    expectTypeOf<keyof LeafSteps>().toEqualTypeOf<never>();
  });

  it('should correctly extract a single leaf step', () => {
    const singleStepFlow = new Flow<{ input: string }>({
      slug: 'single_step_flow',
    }).step({ slug: 'process' }, (input) => ({
      result: input.run.input.toUpperCase(),
    }));

    type LeafSteps = ExtractFlowLeafSteps<typeof singleStepFlow>;

    // The only step is a leaf step since no other step depends on it
    expectTypeOf<LeafSteps>().toMatchTypeOf<{
      process: { result: string };
    }>();

    // Ensure it doesn't include non-existent steps
    expectTypeOf<LeafSteps>().not.toMatchTypeOf<{
      nonExistentStep: unknown;
    }>();
  });

  it('should correctly extract multiple leaf steps', () => {
    const multiLeafFlow = new Flow<{ data: number }>({
      slug: 'multi_leaf_flow',
    })
      .step({ slug: 'intermediate' }, (input) => ({
        value: input.run.data * 2,
      }))
      .step({ slug: 'leaf1', dependsOn: ['intermediate'] }, (input) => ({
        squared: input.intermediate.value ** 2,
      }))
      .step({ slug: 'leaf2', dependsOn: ['intermediate'] }, (input) => ({
        doubled: input.intermediate.value * 2,
      }));

    type LeafSteps = ExtractFlowLeafSteps<typeof multiLeafFlow>;

    // Both leaf1 and leaf2 are leaf steps since no other steps depend on them
    expectTypeOf<LeafSteps>().toMatchTypeOf<{
      leaf1: { squared: number };
      leaf2: { doubled: number };
    }>();

    // The intermediate step should not be included as it's a dependency
    expectTypeOf<LeafSteps>().not.toMatchTypeOf<{
      intermediate: { value: number };
    }>();
  });

  it('should correctly identify a root step that is also a leaf step', () => {
    const rootLeafFlow = new Flow<{ input: string }>({ slug: 'root_leaf_flow' })
      .step({ slug: 'rootLeaf' }, (input) => ({
        processed: input.run.input.trim(),
      }))
      .step({ slug: 'intermediate' }, (input) => ({
        length: input.run.input.length,
      }))
      .step({ slug: 'dependent', dependsOn: ['intermediate'] }, (input) => ({
        result: input.intermediate.length > 10,
      }));

    type LeafSteps = ExtractFlowLeafSteps<typeof rootLeafFlow>;

    // rootLeaf is both a root step (no dependencies) and a leaf step (no dependents)
    // dependent is a leaf step (no dependents)
    expectTypeOf<LeafSteps>().toMatchTypeOf<{
      rootLeaf: { processed: string };
      dependent: { result: boolean };
    }>();

    // intermediate should not be included as it's a dependency
    expectTypeOf<LeafSteps>().not.toMatchTypeOf<{
      intermediate: { length: number };
    }>();
  });

  it('should handle complex dependency chains', () => {
    const complexFlow = new Flow<{ input: number }>({ slug: 'complex_flow' })
      .step({ slug: 'step1' }, (input) => ({ value: input.run.input + 1 }))
      .step({ slug: 'step2', dependsOn: ['step1'] }, (input) => ({
        value: input.step1.value * 2,
      }))
      .step({ slug: 'step3', dependsOn: ['step1'] }, (input) => ({
        value: input.step1.value - 1,
      }))
      .step({ slug: 'step4', dependsOn: ['step2', 'step3'] }, (input) => ({
        sum: input.step2.value + input.step3.value,
        original: input.run.input,
      }));

    type LeafSteps = ExtractFlowLeafSteps<typeof complexFlow>;

    // Only step4 is a leaf step as it's not a dependency of any other step
    expectTypeOf<LeafSteps>().toMatchTypeOf<{
      step4: { sum: number; original: number };
    }>();

    // None of the intermediate steps should be included
    expectTypeOf<LeafSteps>().not.toMatchTypeOf<{
      step1: unknown;
      step2: unknown;
      step3: unknown;
    }>();
  });
});
