import { describe, it, expect } from 'vitest';
import { validateSlug, validateRuntimeOptions } from '../../src/utils.js';

describe('validateSlug', () => {
  it('accepts valid slugs', () => {
    expect(() => validateSlug('valid_slug')).not.toThrowError();
    expect(() => validateSlug('valid_slug_123')).not.toThrowError();
    expect(() => validateSlug('validSlug123')).not.toThrowError();
    expect(() => validateSlug('_valid_slug')).not.toThrowError();
  });

  it('rejects slugs that start with numbers', () => {
    expect(() => validateSlug('1invalid')).toThrowError(
      `Slug '1invalid' cannot start with a number`
    );
  });

  it('rejects empty slugs', () => {
    expect(() => validateSlug('')).toThrowError(`Slug cannot be empty`);
  });

  it('rejects reserved words', () => {
    expect(() => validateSlug('run')).toThrowError(
      `Slug 'run' is reserved and cannot be used`
    );
  });

  it('rejects slugs containing invalid characters', () => {
    expect(() => validateSlug('invalid slug')).toThrowError(
      `Slug 'invalid slug' can only contain letters, numbers, and underscores`
    );
    expect(() => validateSlug('invalid/slug')).toThrowError(
      `Slug 'invalid/slug' can only contain letters, numbers, and underscores`
    );
    expect(() => validateSlug('invalid:slug')).toThrowError(
      `Slug 'invalid:slug' can only contain letters, numbers, and underscores`
    );
    expect(() => validateSlug('invalid?slug')).toThrowError(
      `Slug 'invalid?slug' can only contain letters, numbers, and underscores`
    );
    expect(() => validateSlug('invalid#slug')).toThrowError(
      `Slug 'invalid#slug' can only contain letters, numbers, and underscores`
    );
    expect(() => validateSlug('invalid-slug')).toThrowError(
      `Slug 'invalid-slug' can only contain letters, numbers, and underscores`
    );
  });

  it('rejects slugs longer than 128 characters', () => {
    const longSlug = 'a'.repeat(129);
    expect(() => validateSlug(longSlug)).toThrowError(
      `Slug '${longSlug}' cannot be longer than 128 characters`
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

    it('validates startDelay when provided', () => {
      expect(() =>
        validateRuntimeOptions(
          {
            startDelay: -1,
          },
          { optional: true }
        )
      ).toThrowError('startDelay must be greater than or equal to 0');

      expect(() =>
        validateRuntimeOptions(
          {
            startDelay: 0,
          },
          { optional: true }
        )
      ).not.toThrowError();

      expect(() =>
        validateRuntimeOptions(
          {
            startDelay: 300,
          },
          { optional: true }
        )
      ).not.toThrowError();
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

  it('accepts valid options including startDelay', () => {
    expect(() =>
      validateRuntimeOptions({
        maxAttempts: 3,
        baseDelay: 10,
        timeout: 30,
        startDelay: 600,
      })
    ).not.toThrowError();
  });
});
