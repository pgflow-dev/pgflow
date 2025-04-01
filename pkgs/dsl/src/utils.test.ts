import { describe, it, expect } from 'vitest';
import { validateSlug, validateRuntimeOptions } from './utils.ts';

describe('validateSlug', () => {
  it('accepts valid slugs', () => {
    expect(() => validateSlug('valid_slug')).not.toThrowError();
    expect(() => validateSlug('valid_slug_123')).not.toThrowError();
    expect(() => validateSlug('validSlug123')).not.toThrowError();
  });

  it('rejects slugs that start with numbers', () => {
    expect(() => validateSlug('1invalid')).toThrowError(
      'Slug cannot start with a number'
    );
  });

  it('rejects slugs that start with underscores', () => {
    expect(() => validateSlug('_invalid')).toThrowError(
      'Slug cannot start with an underscore'
    );
  });

  it('rejects slugs containing spaces', () => {
    expect(() => validateSlug('invalid slug')).toThrowError(
      'Slug cannot contain spaces'
    );
  });

  it('rejects slugs containing special characters', () => {
    expect(() => validateSlug('invalid/slug')).toThrowError(
      'Slug cannot contain special characters like /, :, ?, #, -'
    );
    expect(() => validateSlug('invalid:slug')).toThrowError(
      'Slug cannot contain special characters like /, :, ?, #, -'
    );
    expect(() => validateSlug('invalid?slug')).toThrowError(
      'Slug cannot contain special characters like /, :, ?, #, -'
    );
    expect(() => validateSlug('invalid#slug')).toThrowError(
      'Slug cannot contain special characters like /, :, ?, #, -'
    );
    expect(() => validateSlug('invalid-slug')).toThrowError(
      'Slug cannot contain special characters like /, :, ?, #, -'
    );
  });

  it('rejects slugs longer than 128 characters', () => {
    const longSlug = 'a'.repeat(129);
    expect(() => validateSlug(longSlug)).toThrowError(
      'Slug cannot be longer than 128 characters'
    );
  });
});

describe('validateRuntimeOptions', () => {
  describe('when optional is false (default)', () => {
    it('throws when required options are missing', () => {
      expect(() => validateRuntimeOptions({})).toThrowError(
        'maxAttempts is required'
      );
      expect(() => validateRuntimeOptions({ maxAttempts: 1 })).toThrowError(
        'baseDelay is required'
      );
      expect(() =>
        validateRuntimeOptions({ maxAttempts: 1, baseDelay: 5 })
      ).toThrowError('timeout is required');
    });

    it('validates maxAttempts is >= 1', () => {
      expect(() =>
        validateRuntimeOptions({
          maxAttempts: 0,
          baseDelay: 10,
          timeout: 10,
        })
      ).toThrowError('maxAttempts must be greater than or equal to 1');
    });

    it('validates baseDelay is >= 1', () => {
      expect(() =>
        validateRuntimeOptions({
          maxAttempts: 3,
          baseDelay: 0,
          timeout: 10,
        })
      ).toThrowError('baseDelay must be greater than or equal to 1');
    });

    it('validates timeout is >= 3', () => {
      expect(() =>
        validateRuntimeOptions({
          maxAttempts: 3,
          baseDelay: 10,
          timeout: 2,
        })
      ).toThrowError('timeout must be greater than or equal to 3');
    });
  });

  describe('when optional is true', () => {
    it('accepts missing options', () => {
      expect(() =>
        validateRuntimeOptions({}, { optional: true })
      ).not.toThrowError();
      expect(() =>
        validateRuntimeOptions({ maxAttempts: 1 }, { optional: true })
      ).not.toThrowError();
    });

    it('still validates provided options', () => {
      expect(() =>
        validateRuntimeOptions(
          {
            maxAttempts: 0,
          },
          { optional: true }
        )
      ).toThrowError('maxAttempts must be greater than or equal to 1');

      expect(() =>
        validateRuntimeOptions(
          {
            baseDelay: 0,
          },
          { optional: true }
        )
      ).toThrowError('baseDelay must be greater than or equal to 1');

      expect(() =>
        validateRuntimeOptions(
          {
            timeout: 2,
          },
          { optional: true }
        )
      ).toThrowError('timeout must be greater than or equal to 3');
    });
  });

  it('accepts valid options', () => {
    expect(() =>
      validateRuntimeOptions({
        maxAttempts: 3,
        baseDelay: 10,
        timeout: 30,
      })
    ).not.toThrowError();
  });
});
