import { describe, it, vi, beforeEach, expect } from 'vitest';
import { Flow } from './dsl.ts';
import * as utils from './utils.ts';

describe('Steps', () => {
  let flow: Flow<any>;
  const noop = () => null;

  beforeEach(() => {
    flow = new Flow({ slug: 'test_flow' });
  });

  describe('step addition', () => {
    it('adds a step with the correct handler', () => {
      const handler = () => ({ result: 42 });
      const newFlow = flow.step({ slug: 'test_step' }, handler);

      expect(newFlow.getSteps()['test_step'].handler).toBe(handler);
    });

    it('adds steps in the correct order', () => {
      const newFlow = flow
        .step({ slug: 'step1' }, () => ({ a: 1 }))
        .step({ slug: 'step2' }, () => ({ b: 2 }));

      const stepsInOrder = newFlow.getStepsInOrder();
      expect(stepsInOrder.map((s) => s.slug)).toEqual(['step1', 'step2']);
    });
  });

  describe('slug validation', () => {
    it('calls validateSlug with the correct slug', () => {
      const validateSlugSpy = vi.spyOn(utils, 'validateSlug');
      flow.step({ slug: 'test_step' }, noop);
      expect(validateSlugSpy).toHaveBeenCalledWith('test_step');
      validateSlugSpy.mockRestore();
    });

    it('propagates errors from validateSlug', () => {
      const validateSlugSpy = vi.spyOn(utils, 'validateSlug');
      validateSlugSpy.mockImplementation(() => {
        throw new Error('Mock validation error');
      });
      expect(() => flow.step({ slug: 'test' }, noop)).toThrowError(
        'Mock validation error'
      );
      validateSlugSpy.mockRestore();
    });
  });

  describe('dependencies', () => {
    it('can add step without dependencies', () => {
      expect(() => flow.step({ slug: 'no_deps' }, noop)).not.toThrowError();
    });

    it('can add step with explicit empty array of dependencies', () => {
      expect(() =>
        flow.step({ slug: 'empty_deps', dependsOn: [] }, noop)
      ).not.toThrowError();
    });

    it('allows adding step with valid dependencies', () => {
      const newFlow = flow.step({ slug: 'first_step' }, noop);

      expect(() =>
        newFlow.step({ slug: 'second_step', dependsOn: ['first_step'] }, noop)
      ).not.toThrowError();
    });

    it('does not allow adding step with non-existing dependencies', () => {
      expect(() =>
        // @ts-expect-error - dependsOn references non-existing step
        flow.step(
          { slug: 'invalid_deps', dependsOn: ['non_existing_step'] },
          noop
        )
      ).toThrowError(
        'Step "invalid_deps" depends on undefined step "non_existing_step"'
      );
    });

    it('does not allow adding step with non-string dependencies', () => {
      expect(() =>
        // @ts-expect-error - dependsOn contains non-string value
        flow.step({ slug: 'invalid_deps', dependsOn: [12345] }, noop)
      ).toThrowError('Step "invalid_deps" depends on undefined step "12345"');
    });
  });

  describe('runtime options', () => {
    it('calls validateRuntimeOptions with the correct options', () => {
      const validateRuntimeOptionsSpy = vi.spyOn(
        utils,
        'validateRuntimeOptions'
      );
      flow.step(
        {
          slug: 'test_step',
          maxAttempts: 3,
          baseDelay: 100,
          timeout: 30,
        },
        noop
      );
      expect(validateRuntimeOptionsSpy).toHaveBeenCalledWith(
        { maxAttempts: 3, baseDelay: 100, timeout: 30 },
        { optional: true }
      );
      validateRuntimeOptionsSpy.mockRestore();
    });

    it('propagates errors from validateRuntimeOptions', () => {
      const validateRuntimeOptionsSpy = vi.spyOn(
        utils,
        'validateRuntimeOptions'
      );
      validateRuntimeOptionsSpy.mockImplementation(() => {
        throw new Error('Mock validation error');
      });
      expect(() =>
        flow.step(
          {
            slug: 'test_step',
            maxAttempts: 0,
          },
          noop
        )
      ).toThrowError('Mock validation error');
      validateRuntimeOptionsSpy.mockRestore();
    });

    it('stores runtime options on the step definition', () => {
      const newFlow = flow.step(
        {
          slug: 'test_step',
          maxAttempts: 3,
          baseDelay: 100,
          timeout: 30,
        },
        noop
      );

      const stepDef = newFlow.getStepDefinition('test_step');
      expect(stepDef.options).toEqual({
        maxAttempts: 3,
        baseDelay: 100,
        timeout: 30,
      });
    });
  });

  describe('step integration', () => {
    it('allows steps to access run input', async () => {
      const testFlow = new Flow<{ value: number }>({ slug: 'test_flow' }).step(
        { slug: 'step1' },
        ({ run }) => ({ doubled: run.value * 2 })
      );

      const step1Def = testFlow.getStepDefinition('step1');
      const result = await step1Def.handler({ run: { value: 5 } });

      expect(result).toEqual({ doubled: 10 });
    });

    it('allows steps to access dependencies', async () => {
      const testFlow = new Flow<{ value: number }>({ slug: 'test_flow' })
        .step({ slug: 'step1' }, ({ run }) => ({ doubled: run.value * 2 }))
        .step({ slug: 'step2', dependsOn: ['step1'] }, ({ step1 }) => ({
          quadrupled: step1.doubled * 2,
        }));

      const step1Def = testFlow.getStepDefinition('step1');
      const step1Result = await step1Def.handler({ run: { value: 5 } });

      const step2Def = testFlow.getStepDefinition('step2');
      const step2Result = await step2Def.handler({
        run: { value: 5 },
        step1: step1Result,
      });

      expect(step2Result).toEqual({ quadrupled: 20 });
    });
  });
});
