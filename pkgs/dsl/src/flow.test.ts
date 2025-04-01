import { describe, it, vi, beforeEach, expect } from 'vitest';
import { Flow } from './dsl.ts';
import * as utils from './utils.ts';

describe('Flow', () => {
  describe('constructor', () => {
    it('creates a flow with valid defaults', () => {
      const flow = new Flow({ slug: 'valid_flow' });
      expect(flow.slug).toBe('valid_flow');
      expect(flow.options).toEqual({});
      expect(flow.getSteps()).toEqual({});
      expect(flow.getStepsInOrder()).toEqual([]);
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
    it('throws when slug starts with a number', () => {
      expect(() => new Flow({ slug: '1invalid' })).toThrowError(
        'Slug cannot start with a number'
      );
    });

    it('throws when slug starts with an underscore', () => {
      expect(() => new Flow({ slug: '_invalid' })).toThrowError(
        'Slug cannot start with an underscore'
      );
    });

    it('throws when slug contains spaces', () => {
      expect(() => new Flow({ slug: 'invalid slug' })).toThrowError(
        'Slug cannot contain spaces'
      );
    });

    it('throws when slug contains special characters', () => {
      expect(() => new Flow({ slug: 'invalid/slug' })).toThrowError(
        'Slug cannot contain special characters like /, :, ?, #'
      );
    });

    it('throws when slug is too long', () => {
      const longSlug = 'a'.repeat(129);
      expect(() => new Flow({ slug: longSlug })).toThrowError(
        'Slug cannot be longer than 128 characters'
      );
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
    it('returns the step definition when step exists', () => {
      const flow = new Flow<{ value: number }>({ slug: 'test_flow' }).step(
        { slug: 'test_step' },
        () => ({ result: 42 })
      );

      const stepDef = flow.getStepDefinition('test_step');
      expect(stepDef.slug).toBe('test_step');
      expect(stepDef.dependencies).toEqual([]);
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
