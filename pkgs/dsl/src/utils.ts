/**
 * Validates a slug string according to the following rules:
 * - Cannot start with a number
 * - Cannot start with an underscore
 * - Cannot contain spaces
 * - Cannot contain special characters like /, :, ?, #
 * - Cannot be longer than 128 characters
 *
 * @param slug The slug string to validate
 * @throws Error if the slug is invalid
 */
export function validateSlug(slug: string): void {
  if (slug.length > 128) {
    throw new Error(`Slug cannot be longer than 128 characters`);
  }

  if (/^\d/.test(slug)) {
    throw new Error(`Slug cannot start with a number`);
  }

  if (/^_/.test(slug)) {
    throw new Error(`Slug cannot start with an underscore`);
  }

  if (/\s/.test(slug)) {
    throw new Error(`Slug cannot contain spaces`);
  }

  if (/[/:#\-?]/.test(slug)) {
    throw new Error(
      `Slug cannot contain special characters like /, :, ?, #, -`
    );
  }
}

/**
 * Options for validating runtime options
 */
export interface ValidateRuntimeOptionsOpts {
  optional?: boolean;
}

/**
 * Validates runtime options according to the following rules:
 * - maxAttempts should be >= 1
 * - baseDelay should be >= 1
 * - timeout should be >= 3
 *
 * @param options The runtime options to validate
 * @param opts Configuration options for validation
 * @param opts.optional If true, allows options to be null or undefined
 * @throws Error if any runtime option is invalid
 */
export function validateRuntimeOptions(
  options: { maxAttempts?: number; baseDelay?: number; timeout?: number },
  opts: ValidateRuntimeOptionsOpts = { optional: false }
): void {
  const { maxAttempts, baseDelay, timeout } = options;

  // If optional is true, skip validation for undefined/null values
  if (maxAttempts !== undefined && maxAttempts !== null) {
    if (maxAttempts < 1) {
      throw new Error('maxAttempts must be greater than or equal to 1');
    }
  } else if (!opts.optional) {
    throw new Error('maxAttempts is required');
  }

  if (baseDelay !== undefined && baseDelay !== null) {
    if (baseDelay < 1) {
      throw new Error('baseDelay must be greater than or equal to 1');
    }
  } else if (!opts.optional) {
    throw new Error('baseDelay is required');
  }

  if (timeout !== undefined && timeout !== null) {
    if (timeout < 3) {
      throw new Error('timeout must be greater than or equal to 3');
    }
  } else if (!opts.optional) {
    throw new Error('timeout is required');
  }
}
