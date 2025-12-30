import { describe, it, vi, beforeEach, expect } from 'vitest';
import { Flow } from '../../src/dsl.js';
import * as utils from '../../src/utils.js';

describe('.array() method', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let flow: Flow<any>;
  const arrayNoop = () => [];

  beforeEach(() => {
    flow = new Flow({ slug: 'test_flow' });
  });

  describe('basic functionality', () => {
    it('adds an array step with the correct handler', () => {
      const handler = () => [{ id: 1 }, { id: 2 }];
      const newFlow = flow.array({ slug: 'items' }, handler);

      expect(newFlow.getStepDefinition('items').handler).toBe(handler);
    });

    it('behaves identically to .step() for array-returning handlers', () => {
      const handler = () => [{ id: 1 }, { id: 2 }];
      const arrayFlow = flow.array({ slug: 'items' }, handler);
      const stepFlow = flow.step({ slug: 'items' }, handler);
      
      const arrayStepDef = arrayFlow.getStepDefinition('items');
      const stepStepDef = stepFlow.getStepDefinition('items');

      expect(arrayStepDef.slug).toEqual(stepStepDef.slug);
      expect(arrayStepDef.handler).toBe(stepStepDef.handler);
      expect(arrayStepDef.dependencies).toEqual(stepStepDef.dependencies);
      expect(arrayStepDef.options).toEqual(stepStepDef.options);
    });

    it('throws when adding array step with the same slug', () => {
      const newFlow = flow.array({ slug: 'test_step' }, arrayNoop);

      expect(() => newFlow.array({ slug: 'test_step' }, arrayNoop)).toThrowError(
        'Step "test_step" already exists in flow "test_flow"'
      );
    });

    it('stores the step in correct order', () => {
      const newFlow = flow
        .array({ slug: 'first' }, () => [1])
        .array({ slug: 'second' }, () => [2]);

      expect(newFlow.stepOrder).toEqual(['first', 'second']);
    });
  });

  describe('slug validation', () => {
    it('calls validateSlug with the correct slug', () => {
      const validateSlugSpy = vi.spyOn(utils, 'validateSlug');
      flow.array({ slug: 'test_array' }, arrayNoop);
      expect(validateSlugSpy).toHaveBeenCalledWith('test_array');
      validateSlugSpy.mockRestore();
    });

    it('propagates errors from validateSlug', () => {
      const validateSlugSpy = vi.spyOn(utils, 'validateSlug');
      validateSlugSpy.mockImplementation(() => {
        throw new Error('Mock validation error');
      });
      expect(() => flow.array({ slug: 'test' }, arrayNoop)).toThrowError(
        'Mock validation error'
      );
      validateSlugSpy.mockRestore();
    });
  });

  describe('dependencies', () => {
    it('can add array step without dependencies', () => {
      expect(() => flow.array({ slug: 'no_deps' }, arrayNoop)).not.toThrowError();
    });

    it('can add array step with explicit empty array of dependencies', () => {
      expect(() =>
        flow.array({ slug: 'empty_deps', dependsOn: [] }, arrayNoop)
      ).not.toThrowError();
    });

    it('allows adding array step with valid dependencies', () => {
      const newFlow = flow.step({ slug: 'first_step' }, () => 42);

      expect(() =>
        newFlow.array({ slug: 'array_step', dependsOn: ['first_step'] }, arrayNoop)
      ).not.toThrowError();
    });

    it('allows array step to depend on other array steps', () => {
      const newFlow = flow.array({ slug: 'first_array' }, () => [1, 2, 3]);

      expect(() =>
        newFlow.array({ slug: 'second_array', dependsOn: ['first_array'] }, arrayNoop)
      ).not.toThrowError();
    });

    it('does not allow adding array step with non-existing dependencies', () => {
      expect(() =>
        flow.array(
          // @ts-expect-error - dependsOn references non-existing step
          { slug: 'invalid_deps', dependsOn: ['non_existing_step'] },
          arrayNoop
        )
      ).toThrowError(
        'Step "invalid_deps" depends on undefined step "non_existing_step"'
      );
    });

    it('stores dependencies correctly', () => {
      const newFlow = flow
        .step({ slug: 'step1' }, () => 1)
        .array({ slug: 'array1', dependsOn: ['step1'] }, () => [1, 2]);

      expect(newFlow.getStepDefinition('array1').dependencies).toEqual(['step1']);
    });
  });

  describe('runtime options', () => {
    it('calls validateRuntimeOptions with the correct options', () => {
      const validateRuntimeOptionsSpy = vi.spyOn(
        utils,
        'validateRuntimeOptions'
      );
      flow.array(
        {
          slug: 'test_array',
          maxAttempts: 3,
          baseDelay: 100,
          timeout: 30,
        },
        arrayNoop
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
        flow.array(
          {
            slug: 'test_array',
            maxAttempts: 0,
          },
          arrayNoop
        )
      ).toThrowError('Mock validation error');
      validateRuntimeOptionsSpy.mockRestore();
    });

    it('stores runtime options on the array step definition', () => {
      const newFlow = flow.array(
        {
          slug: 'test_array',
          maxAttempts: 3,
          baseDelay: 100,
          timeout: 30,
        },
        arrayNoop
      );

      const stepDef = newFlow.getStepDefinition('test_array');
      expect(stepDef.options).toEqual({
        maxAttempts: 3,
        baseDelay: 100,
        timeout: 30,
      });
    });

    it('stores startDelay option on the array step definition', () => {
      const newFlow = flow.array(
        {
          slug: 'test_array',
          startDelay: 300,
        },
        arrayNoop
      );

      const stepDef = newFlow.getStepDefinition('test_array');
      expect(stepDef.options).toEqual({
        startDelay: 300,
      });
    });

    it('stores all runtime options including startDelay', () => {
      const newFlow = flow.array(
        {
          slug: 'test_array',
          maxAttempts: 3,
          baseDelay: 100,
          timeout: 30,
          startDelay: 600,
        },
        arrayNoop
      );

      const stepDef = newFlow.getStepDefinition('test_array');
      expect(stepDef.options).toEqual({
        maxAttempts: 3,
        baseDelay: 100,
        timeout: 30,
        startDelay: 600,
      });
    });

    it('validates startDelay option', () => {
      const validateRuntimeOptionsSpy = vi.spyOn(
        utils,
        'validateRuntimeOptions'
      );
      flow.array(
        {
          slug: 'test_array',
          startDelay: 300,
        },
        arrayNoop
      );
      expect(validateRuntimeOptionsSpy).toHaveBeenCalledWith(
        { startDelay: 300 },
        { optional: true }
      );
      validateRuntimeOptionsSpy.mockRestore();
    });
  });

  describe('array step integration', () => {
    it('allows array steps to access run input', async () => {
      const testFlow = new Flow<{ count: number }>({ slug: 'test_flow' }).array(
        { slug: 'numbers' },
        (flowInput) => Array(flowInput.count).fill(0).map((_, i) => ({ index: i }))
      );

      const numbersDef = testFlow.getStepDefinition('numbers');
      const result = await numbersDef.handler({ count: 3 });

      expect(result).toEqual([
        { index: 0 },
        { index: 1 },
        { index: 2 }
      ]);
    });

    it('allows steps to depend on array steps', async () => {
      const testFlow = new Flow<{ multiplier: number }>({ slug: 'test_flow' })
        .array({ slug: 'numbers' }, () => [1, 2, 3])
        .step({ slug: 'sum', dependsOn: ['numbers'] }, async (deps, ctx) => {
          const flowInput = await ctx.flowInput;
          return deps.numbers.reduce((acc, n) => acc + n * flowInput.multiplier, 0);
        });

      const numbersDef = testFlow.getStepDefinition('numbers');
      const numbersResult = await numbersDef.handler({ multiplier: 2 });

      const sumDef = testFlow.getStepDefinition('sum');
      const sumResult = await sumDef.handler({
        numbers: numbersResult
      }, { flowInput: Promise.resolve({ multiplier: 2 }) } as any);

      expect(numbersResult).toEqual([1, 2, 3]);
      expect(sumResult).toBe(12); // (1 + 2 + 3) * 2
    });

    it('allows array steps to depend on other array steps', async () => {
      const testFlow = new Flow<{ factor: number }>({ slug: 'test_flow' })
        .array({ slug: 'base_numbers' }, () => [1, 2, 3])
        .array({ slug: 'doubled', dependsOn: ['base_numbers'] }, async (deps, ctx) => {
          const flowInput = await ctx.flowInput;
          return deps.base_numbers.map(n => n * flowInput.factor);
        });

      const baseDef = testFlow.getStepDefinition('base_numbers');
      const baseResult = await baseDef.handler({ factor: 2 });

      const doubledDef = testFlow.getStepDefinition('doubled');
      const doubledResult = await doubledDef.handler({
        base_numbers: baseResult
      }, { flowInput: Promise.resolve({ factor: 2 }) } as any);

      expect(baseResult).toEqual([1, 2, 3]);
      expect(doubledResult).toEqual([2, 4, 6]);
    });

    it('allows array steps to depend on regular steps', async () => {
      const testFlow = new Flow<{ size: number }>({ slug: 'test_flow' })
        .step({ slug: 'config' }, (flowInput) => ({ length: flowInput.size, prefix: 'item' }))
        .array({ slug: 'items', dependsOn: ['config'] }, (deps) =>
          Array(deps.config.length).fill(0).map((_, i) => `${deps.config.prefix}_${i}`)
        );

      const configDef = testFlow.getStepDefinition('config');
      const configResult = await configDef.handler({ size: 3 });

      const itemsDef = testFlow.getStepDefinition('items');
      const itemsResult = await itemsDef.handler({
        config: configResult
      });

      expect(configResult).toEqual({ length: 3, prefix: 'item' });
      expect(itemsResult).toEqual(['item_0', 'item_1', 'item_2']);
    });

    it('supports multiple dependencies for array steps', async () => {
      const testFlow = new Flow<{ base: number }>({ slug: 'test_flow' })
        .step({ slug: 'multiplier' }, (flowInput) => flowInput.base * 2)
        .step({ slug: 'offset' }, (flowInput) => flowInput.base + 10)
        .array({ slug: 'combined', dependsOn: ['multiplier', 'offset'] }, (deps) =>
          [deps.multiplier, deps.offset, deps.multiplier + deps.offset]
        );

      const multiplierDef = testFlow.getStepDefinition('multiplier');
      const multiplierResult = await multiplierDef.handler({ base: 5 });

      const offsetDef = testFlow.getStepDefinition('offset');
      const offsetResult = await offsetDef.handler({ base: 5 });

      const combinedDef = testFlow.getStepDefinition('combined');
      const combinedResult = await combinedDef.handler({
        multiplier: multiplierResult,
        offset: offsetResult
      });

      expect(multiplierResult).toBe(10);
      expect(offsetResult).toBe(15);
      expect(combinedResult).toEqual([10, 15, 25]);
    });
  });

  describe('async array handlers', () => {
    it('supports async array handlers', async () => {
      const testFlow = new Flow<{ delay: number }>({ slug: 'test_flow' }).array(
        { slug: 'async_data' },
        async (flowInput) => {
          // Simulate async operation
          await new Promise(resolve => setTimeout(resolve, flowInput.delay));
          return [{ processed: true }, { processed: false }];
        }
      );

      const asyncDef = testFlow.getStepDefinition('async_data');
      const result = await asyncDef.handler({ delay: 1 });

      expect(result).toEqual([
        { processed: true },
        { processed: false }
      ]);
    });
  });

  describe('comparison with .step() method', () => {
    it('produces identical step definitions for the same handler', () => {
      const handler = () => [1, 2, 3];
      
      const arrayFlow = flow.array({ slug: 'test_array' }, handler);
      const stepFlow = flow.step({ slug: 'test_array' }, handler);

      const arrayStepDef = arrayFlow.getStepDefinition('test_array');
      const stepStepDef = stepFlow.getStepDefinition('test_array');

      // Compare all properties except they should be identical
      expect(arrayStepDef.slug).toEqual(stepStepDef.slug);
      expect(arrayStepDef.handler).toBe(stepStepDef.handler);
      expect(arrayStepDef.dependencies).toEqual(stepStepDef.dependencies);
      expect(arrayStepDef.options).toEqual(stepStepDef.options);
    });

    it('produces identical step definitions with options', () => {
      const handler = () => [{ id: 1 }];
      const options = {
        maxAttempts: 5,
        baseDelay: 200,
        timeout: 60,
        startDelay: 100
      };
      
      const arrayFlow = flow.array({ slug: 'test_array', ...options }, handler);
      const stepFlow = flow.step({ slug: 'test_array', ...options }, handler);

      const arrayStepDef = arrayFlow.getStepDefinition('test_array');
      const stepStepDef = stepFlow.getStepDefinition('test_array');

      expect(arrayStepDef).toEqual(stepStepDef);
    });

    it('produces identical step definitions with dependencies', () => {
      const baseFlow = flow.step({ slug: 'dependency' }, () => 42);
      const handler = () => [1, 2, 3];
      
      const arrayFlow = baseFlow.array({ slug: 'test_array', dependsOn: ['dependency'] }, handler);
      const stepFlow = baseFlow.step({ slug: 'test_array', dependsOn: ['dependency'] }, handler);

      const arrayStepDef = arrayFlow.getStepDefinition('test_array');
      const stepStepDef = stepFlow.getStepDefinition('test_array');

      expect(arrayStepDef).toEqual(stepStepDef);
    });
  });
});