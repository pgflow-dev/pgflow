import { describe, it } from 'vitest';
import { validateRuntimeOptions, validateSlug } from './utils.ts';

describe('validateSlug', () => {
  it('accepts valid slugs', ({ expect }) => {
    expect(() => validateSlug('valid_slug')).not.toThrow();
    expect(() => validateSlug('valid-slug')).not.toThrow();
    expect(() => validateSlug('validSlug')).not.toThrow();
    expect(() => validateSlug('a')).not.toThrow();
  });

  it('rejects slugs that start with a number', ({ expect }) => {
    expect(() => validateSlug('1invalid')).toThrowError(
      'Slug cannot start with a number'
    );
  });

  it('rejects slugs that start with an underscore', ({ expect }) => {
    expect(() => validateSlug('_invalid')).toThrowError(
      'Slug cannot start with an underscore'
    );
  });

  it('rejects slugs with spaces', ({ expect }) => {
    expect(() => validateSlug('invalid slug')).toThrowError(
      'Slug cannot contain spaces'
    );
  });

  it('rejects slugs with special characters', ({ expect }) => {
    expect(() => validateSlug('invalid/slug')).toThrowError(
      'Slug cannot contain special characters'
    );
    expect(() => validateSlug('invalid:slug')).toThrowError(
      'Slug cannot contain special characters'
    );
    expect(() => validateSlug('invalid?slug')).toThrowError(
      'Slug cannot contain special characters'
    );
    expect(() => validateSlug('invalid#slug')).toThrowError(
      'Slug cannot contain special characters'
    );
  });

  it('rejects slugs longer than 128 characters', ({ expect }) => {
    const longSlug = 'a'.repeat(129);
    expect(() => validateSlug(longSlug)).toThrowError(
      'Slug cannot be longer than 128 characters'
    );
  });
});

describe('validateRuntimeOptions', () => {
  describe('with optional=false (default)', () => {
    it('accepts valid runtime options', ({ expect }) => {
      expect(() =>
        validateRuntimeOptions({
          maxAttempts: 1,
          baseDelay: 1,
          timeout: 3,
        })
      ).not.toThrow();

      expect(() =>
        validateRuntimeOptions({
          maxAttempts: 5,
          baseDelay: 100,
          timeout: 30,
        })
      ).not.toThrow();
    });

    it('rejects when maxAttempts is missing', ({ expect }) => {
      expect(() =>
        validateRuntimeOptions({
          baseDelay: 1,
          timeout: 3,
        })
      ).toThrowError('maxAttempts is required');
    });

    it('rejects when baseDelay is missing', ({ expect }) => {
      expect(() =>
        validateRuntimeOptions({
          maxAttempts: 1,
          timeout: 3,
        })
      ).toThrowError('baseDelay is required');
    });

    it('rejects when timeout is missing', ({ expect }) => {
      expect(() =>
        validateRuntimeOptions({
          maxAttempts: 1,
          baseDelay: 1,
        })
      ).toThrowError('timeout is required');
    });

    it('rejects when maxAttempts is less than 1', ({ expect }) => {
      expect(() =>
        validateRuntimeOptions({
          maxAttempts: 0,
          baseDelay: 1,
          timeout: 3,
        })
      ).toThrowError('maxAttempts must be greater than or equal to 1');
    });

    it('rejects when baseDelay is less than 1', ({ expect }) => {
      expect(() =>
        validateRuntimeOptions({
          maxAttempts: 1,
          baseDelay: 0,
          timeout: 3,
        })
      ).toThrowError('baseDelay must be greater than or equal to 1');
    });

    it('rejects when timeout is less than 3', ({ expect }) => {
      expect(() =>
        validateRuntimeOptions({
          maxAttempts: 1,
          baseDelay: 1,
          timeout: 2,
        })
      ).toThrowError('timeout must be greater than or equal to 3');
    });
  });

  describe('with optional=true', () => {
    it('accepts valid runtime options', ({ expect }) => {
      expect(() =>
        validateRuntimeOptions(
          {
            maxAttempts: 1,
            baseDelay: 1,
            timeout: 3,
          },
          { optional: true }
        )
      ).not.toThrow();
    });

    it('accepts missing options', ({ expect }) => {
      expect(() =>
        validateRuntimeOptions({}, { optional: true })
      ).not.toThrow();
      expect(() =>
        validateRuntimeOptions({ maxAttempts: 1 }, { optional: true })
      ).not.toThrow();
      expect(() =>
        validateRuntimeOptions({ baseDelay: 1 }, { optional: true })
      ).not.toThrow();
      expect(() =>
        validateRuntimeOptions({ timeout: 3 }, { optional: true })
      ).not.toThrow();
    });

    it('accepts null options', ({ expect }) => {
      expect(() =>
        validateRuntimeOptions(
          {
            maxAttempts: null as any,
            baseDelay: null as any,
            timeout: null as any,
          },
          { optional: true }
        )
      ).not.toThrow();
    });

    it('still rejects invalid values when provided', ({ expect }) => {
      expect(() =>
        validateRuntimeOptions(
          {
            maxAttempts: 0,
            baseDelay: 1,
            timeout: 3,
          },
          { optional: true }
        )
      ).toThrowError('maxAttempts must be greater than or equal to 1');

      expect(() =>
        validateRuntimeOptions(
          {
            maxAttempts: 1,
            baseDelay: 0,
            timeout: 3,
          },
          { optional: true }
        )
      ).toThrowError('baseDelay must be greater than or equal to 1');

      expect(() =>
        validateRuntimeOptions(
          {
            maxAttempts: 1,
            baseDelay: 1,
            timeout: 2,
          },
          { optional: true }
        )
      ).toThrowError('timeout must be greater than or equal to 3');
    });
  });
});
