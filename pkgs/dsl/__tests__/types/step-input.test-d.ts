import { Flow, type StepInput } from '../../src/index.js';
import { describe, it, expectTypeOf } from 'vitest';

describe('StepInput utility type (asymmetric)', () => {
  describe('for a flow without steps', () => {
    const emptyFlow = new Flow<{ userId: number }>({ slug: 'empty_flow' });
    type NonExistentInput = StepInput<typeof emptyFlow, 'nonExistentStep'>;

    it('should return flow input directly for non-existent steps (treated as root)', () => {
      // Non-existent steps are treated as root steps - they get flow input directly
      expectTypeOf<NonExistentInput>().toMatchTypeOf<{ userId: number }>();
    });

    it('should not have run wrapper', () => {
      expectTypeOf<NonExistentInput>().not.toMatchTypeOf<{
        run: { userId: number };
      }>();
    });
  });

  describe('for a flow with two root steps', () => {
    const twoRootFlow = new Flow<{ baseInput: string }>({
      slug: 'two_root_flow',
    })
      .step({ slug: 'step1' }, (flowInput) => ({ result1: flowInput.baseInput.length }))
      .step({ slug: 'step2' }, (flowInput) => ({ result2: flowInput.baseInput }));

    describe('step1 input (root step)', () => {
      type Step1Input = StepInput<typeof twoRootFlow, 'step1'>;

      it('should receive flow input directly (no run wrapper)', () => {
        expectTypeOf<Step1Input>().toMatchTypeOf<{ baseInput: string }>();
        expectTypeOf<Step1Input>().not.toMatchTypeOf<{ run: any }>();
      });

      it('should not contain other steps outputs', () => {
        expectTypeOf<Step1Input>().not.toMatchTypeOf<{
          step2: { result2: string };
        }>();
      });
    });

    describe('step2 input (root step)', () => {
      type Step2Input = StepInput<typeof twoRootFlow, 'step2'>;

      it('should receive flow input directly (no run wrapper)', () => {
        expectTypeOf<Step2Input>().toMatchTypeOf<{ baseInput: string }>();
      });

      it('should not contain other steps outputs', () => {
        expectTypeOf<Step2Input>().not.toMatchTypeOf<{
          step1: { result1: number };
        }>();
      });
    });
  });

  describe('for a flow with root step and dependent steps', () => {
    const dependentFlow = new Flow<{ userId: string }>({
      slug: 'dependent_flow',
    })
      .step({ slug: 'rootStep' }, (flowInput) => ({ data: flowInput.userId }))
      .step({ slug: 'dependent1', dependsOn: ['rootStep'] }, (deps) => ({
        child: deps.rootStep.data.length,
      }))
      .step({ slug: 'dependent2', dependsOn: ['rootStep'] }, (deps) => ({
        child: deps.rootStep.data.toUpperCase(),
      }));

    describe('rootStep input', () => {
      type RootStepInput = StepInput<typeof dependentFlow, 'rootStep'>;

      it('should receive flow input directly', () => {
        expectTypeOf<RootStepInput>().toMatchTypeOf<{ userId: string }>();
      });

      it('should not have run wrapper', () => {
        expectTypeOf<RootStepInput>().not.toMatchTypeOf<{
          run: { userId: string };
        }>();
      });

      it('should not contain dependent steps', () => {
        expectTypeOf<RootStepInput>().not.toMatchTypeOf<{
          dependent1: any;
        }>();
      });
    });

    describe('dependent1 input', () => {
      type Dependent1Input = StepInput<typeof dependentFlow, 'dependent1'>;

      it('should contain only rootStep dependency (no run key)', () => {
        expectTypeOf<Dependent1Input>().toMatchTypeOf<{
          rootStep: { data: string };
        }>();
      });

      it('should NOT contain run key (flow input available via context)', () => {
        expectTypeOf<Dependent1Input>().not.toMatchTypeOf<{
          run: { userId: string };
        }>();
      });

      it('should not contain other dependent steps', () => {
        expectTypeOf<Dependent1Input>().not.toMatchTypeOf<{
          dependent2: any;
        }>();
      });
    });

    describe('dependent2 input', () => {
      type Dependent2Input = StepInput<typeof dependentFlow, 'dependent2'>;

      it('should contain only rootStep dependency (no run key)', () => {
        expectTypeOf<Dependent2Input>().toMatchTypeOf<{
          rootStep: { data: string };
        }>();
      });

      it('should NOT contain run key', () => {
        expectTypeOf<Dependent2Input>().not.toMatchTypeOf<{
          run: { userId: string };
        }>();
      });
    });
  });

  describe('for a flow with multiple dependencies', () => {
    const complexFlow = new Flow<{ initial: boolean }>({
      slug: 'complex_flow',
    })
      .step({ slug: 'step1' }, () => ({ val1: 'a' }))
      .step({ slug: 'step2' }, () => ({ val2: 'b' }))
      .step({ slug: 'step3', dependsOn: ['step1', 'step2'] }, (deps) => ({
        val3: deps.step1.val1 + deps.step2.val2,
      }));

    describe('step3 input with multiple dependencies', () => {
      type Step3Input = StepInput<typeof complexFlow, 'step3'>;

      it('should contain only dependencies (no run key)', () => {
        expectTypeOf<Step3Input>().toMatchTypeOf<{
          step1: { val1: string };
          step2: { val2: string };
        }>();
      });

      it('should NOT contain run key', () => {
        expectTypeOf<Step3Input>().not.toMatchTypeOf<{
          run: { initial: boolean };
        }>();
      });
    });

    it('should return flow input for non-existent steps (treated as root)', () => {
      type NonExistentInput = StepInput<typeof complexFlow, 'nonExistentStep'>;
      expectTypeOf<NonExistentInput>().toMatchTypeOf<{ initial: boolean }>();
      // No run wrapper
      expectTypeOf<NonExistentInput>().not.toMatchTypeOf<{
        run: { initial: boolean };
      }>();
    });
  });

  describe('handler parameter types in practice', () => {
    it('root step handler receives flowInput directly', () => {
      const flow = new Flow<{ userId: string }>({ slug: 'test_flow' })
        .step({ slug: 'root' }, (flowInput, _ctx) => {
          // flowInput should be the flow input directly
          expectTypeOf(flowInput).toMatchTypeOf<{ userId: string }>();
          return { processed: flowInput.userId };
        });

      expectTypeOf(flow).toMatchTypeOf<Flow<{ userId: string }, any, any, any, any>>();
    });

    it('dependent step handler receives deps object only', () => {
      const flow = new Flow<{ userId: string }>({ slug: 'test_flow' })
        .step({ slug: 'fetch' }, () => ({ data: 'fetched' }))
        .step({ slug: 'process', dependsOn: ['fetch'] }, (deps, ctx) => {
          // deps should only contain dependencies
          expectTypeOf(deps).toMatchTypeOf<{ fetch: { data: string } }>();
          // flowInput available via context as Promise
          expectTypeOf(ctx.flowInput).toMatchTypeOf<Promise<{ userId: string }>>();
          return { result: deps.fetch.data };
        });

      expectTypeOf(flow).toMatchTypeOf<Flow<{ userId: string }, any, any, any, any>>();
    });
  });
});
