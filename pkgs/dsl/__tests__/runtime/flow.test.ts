import { describe, it, vi, expect } from 'vitest';
import { Flow } from '../../src/dsl.js';
import * as utils from '../../src/utils.js';

const noop = () => null;

describe('Flow', () => {
  describe('constructor', () => {
    it('creates a flow with valid defaults', () => {
      const flow = new Flow({ slug: 'valid_flow' });
      expect(flow.slug).toBe('valid_flow');
      expect(flow.options).toEqual({});
    });

    it('creates a flow with custom runtime options', () => {
      const flow = new Flow({
        slug: 'custom_flow',
        maxAttempts: 3,
        baseDelay: 100,
        timeout: 30,
      });
      expect(flow.slug).toBe('custom_flow');
      expect(flow.options).toEqual({
        maxAttempts: 3,
        baseDelay: 100,
        timeout: 30,
      });
    });
  });

  describe('slug validation', () => {
    it('calls validateSlug with the correct slug', () => {
      const validateSlugSpy = vi.spyOn(utils, 'validateSlug');
      new Flow({ slug: 'hello_world' });
      expect(validateSlugSpy).toHaveBeenCalledWith('hello_world');
      validateSlugSpy.mockRestore();
    });

    it('propagates errors from validateSlug', () => {
      const validateSlugSpy = vi.spyOn(utils, 'validateSlug');
      validateSlugSpy.mockImplementation(() => {
        throw new Error('Mock validation error');
      });
      expect(() => new Flow({ slug: 'test' })).toThrowError(
        'Mock validation error'
      );
      validateSlugSpy.mockRestore();
    });

    // Integration tests for invalid slugs
    it('rejects invalid slugs during flow creation', () => {
      expect(() => new Flow({ slug: '1invalid' })).toThrowError();
    });
  });

  describe('runtime options validation', () => {
    it('calls validateRuntimeOptions with the correct options', () => {
      const validateRuntimeOptionsSpy = vi.spyOn(
        utils,
        'validateRuntimeOptions'
      );
      new Flow({
        slug: 'test_flow',
        maxAttempts: 3,
        baseDelay: 100,
        timeout: 30,
      });
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
      expect(
        () => new Flow({ slug: 'test_flow', maxAttempts: 0 })
      ).toThrowError('Mock validation error');
      validateRuntimeOptionsSpy.mockRestore();
    });
  });

  describe('getStepDefinition', () => {
    it('returns the root step definition when step exists', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test_flow' }).step(
        { slug: 'root_step' },
        noop
      );

      const stepDef = flow.getStepDefinition('root_step');
      expect(stepDef.slug).toBe('root_step');
      expect(stepDef.dependencies).toEqual([]);
    });

    it('returns the normal step definition when step exists', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test_flow' })
        .step({ slug: 'root_step' }, noop)
        .step({ slug: 'last_step', dependsOn: ['root_step'] }, noop);

      const stepDef = flow.getStepDefinition('last_step');
      expect(stepDef.slug).toBe('last_step');
      expect(stepDef.dependencies).toEqual(['root_step']);
    });

    it('throws error when step does not exist', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test_flow' });

      // @ts-expect-error - intentionally testing invalid slug
      expect(() => flow.getStepDefinition('non_existent')).toThrowError(
        'Step "non_existent" does not exist in flow "test_flow"'
      );
    });
  });
});
