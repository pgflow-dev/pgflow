import { Flow, type StepInput } from '../../src/index.js';
import { describe, it, expectTypeOf } from 'vitest';

describe('StepInput utility type', () => {
  describe('for a flow without steps', () => {
    const emptyFlow = new Flow<{ userId: number }>({ slug: 'empty_flow' });
    type NonExistentInput = StepInput<typeof emptyFlow, 'nonExistentStep'>;

    it('should contain only run input for non-existent steps', () => {
      expectTypeOf<NonExistentInput>().toMatchTypeOf<{
        run: { userId: number };
      }>();
    });

    it('should not allow extraneous keys', () => {
      expectTypeOf<NonExistentInput>().not.toMatchTypeOf<{
        nonExistentStep: any;
      }>();
    });
  });

  describe('for a flow with two root steps', () => {
    const twoRootFlow = new Flow<{ baseInput: string }>({
      slug: 'two_root_flow',
    })
      .step({ slug: 'step1' }, () => ({ result1: 42 }))
      .step({ slug: 'step2' }, () => ({ result2: 'test' }));

    describe('step1 input', () => {
      type Step1Input = StepInput<typeof twoRootFlow, 'step1'>;

      it('should only contain run input and not the other root step', () => {
        expectTypeOf<Step1Input>().toMatchTypeOf<{
          run: { baseInput: string };
        }>();
        expectTypeOf<Step1Input>().not.toMatchTypeOf<{
          step2: { result2: string };
        }>();
      });

      it('should not allow extraneous keys', () => {
        expectTypeOf<Step1Input>().not.toMatchTypeOf<{
          extraProperty: unknown;
        }>();
      });
    });

    describe('step2 input', () => {
      type Step2Input = StepInput<typeof twoRootFlow, 'step2'>;

      it('should only contain run input and not contain the other root step', () => {
        expectTypeOf<Step2Input>().toMatchTypeOf<{
          run: { baseInput: string };
        }>();
        expectTypeOf<Step2Input>().not.toMatchTypeOf<{
          step1: { result1: number };
        }>();
      });

      it('should not allow extraneous keys', () => {
        expectTypeOf<Step2Input>().not.toMatchTypeOf<{
          extraProperty: unknown;
        }>();
      });
    });

    it('should contain only run input if used for non-existent steps', () => {
      type NonExistentInput = StepInput<typeof twoRootFlow, 'nonExistentStep'>;
      expectTypeOf<NonExistentInput>().toMatchTypeOf<{
        run: { baseInput: string };
      }>();
      expectTypeOf<NonExistentInput>().not.toMatchTypeOf<{
        step1: any;
      }>();
      expectTypeOf<NonExistentInput>().not.toMatchTypeOf<{
        step2: any;
      }>();
      expectTypeOf<NonExistentInput>().not.toMatchTypeOf<{
        extraProperty: unknown;
      }>();
    });
  });

  describe('for a flow with root step and dependent steps', () => {
    const dependentFlow = new Flow<{ userId: string }>({
      slug: 'dependent_flow',
    })
      .step({ slug: 'rootStep' }, () => ({ data: 'root' }))
      .step({ slug: 'dependent1', dependsOn: ['rootStep'] }, () => ({
        child: 1,
      }))
      .step({ slug: 'dependent2', dependsOn: ['rootStep'] }, () => ({
        child: 2,
      }));

    describe('rootStep input', () => {
      type RootStepInput = StepInput<typeof dependentFlow, 'rootStep'>;

      it('should only contain run input', () => {
        expectTypeOf<RootStepInput>().toMatchTypeOf<{
          run: { userId: string };
        }>();
      });

      it('should not contain dependent1 step', () => {
        expectTypeOf<RootStepInput>().not.toMatchTypeOf<{
          dependent1: { child: number };
        }>();
      });

      it('should not contain dependent2 step', () => {
        expectTypeOf<RootStepInput>().not.toMatchTypeOf<{
          dependent2: { child: number };
        }>();
      });

      it('should not allow extraneous keys', () => {
        expectTypeOf<RootStepInput>().not.toMatchTypeOf<{
          extraProperty: unknown;
        }>();
      });
    });

    describe('dependent1 input', () => {
      type Dependent1Input = StepInput<typeof dependentFlow, 'dependent1'>;

      it('should contain run input and rootStep', () => {
        expectTypeOf<Dependent1Input>().toMatchTypeOf<{
          run: { userId: string };
          rootStep: { data: string };
        }>();
      });

      it('should not contain dependent2 step', () => {
        expectTypeOf<Dependent1Input>().not.toMatchTypeOf<{
          dependent2: { child: number };
        }>();
      });

      it('should not allow extraneous keys', () => {
        expectTypeOf<Dependent1Input>().not.toMatchTypeOf<{
          extraProperty: unknown;
        }>();
      });
    });

    describe('dependent2 input', () => {
      type Dependent2Input = StepInput<typeof dependentFlow, 'dependent2'>;

      it('should contain run input and rootStep', () => {
        expectTypeOf<Dependent2Input>().toMatchTypeOf<{
          run: { userId: string };
          rootStep: { data: string };
        }>();
      });

      it('should not contain dependent1 step', () => {
        expectTypeOf<Dependent2Input>().not.toMatchTypeOf<{
          dependent1: { child: number };
        }>();
      });

      it('should not allow extraneous keys', () => {
        expectTypeOf<Dependent2Input>().not.toMatchTypeOf<{
          extraProperty: unknown;
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
      .step({ slug: 'step3', dependsOn: ['step1', 'step2'] }, () => ({
        val3: 'c',
      }));

    describe('step3 input with multiple dependencies', () => {
      type Step3Input = StepInput<typeof complexFlow, 'step3'>;

      it('should contain run input and both dependencies', () => {
        expectTypeOf<Step3Input>().toMatchTypeOf<{
          run: { initial: boolean };
          step1: { val1: string };
          step2: { val2: string };
        }>();
      });

      it('should not allow extraneous keys', () => {
        expectTypeOf<Step3Input>().not.toMatchTypeOf<{
          extraProperty: unknown;
        }>();
      });
    });

    it('should contain only run input for non-existent steps', () => {
      type NonExistentInput = StepInput<typeof complexFlow, 'nonExistentStep'>;
      expectTypeOf<NonExistentInput>().toMatchTypeOf<{
        run: { initial: boolean };
      }>();
      expectTypeOf<NonExistentInput>().not.toMatchTypeOf<{
        step1: { val1: string };
      }>();
      expectTypeOf<NonExistentInput>().not.toMatchTypeOf<{
        step2: { val2: string };
      }>();
    });
  });
});
