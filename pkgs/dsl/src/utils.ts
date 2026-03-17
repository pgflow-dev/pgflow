/**
 * Validates a slug string according to the following rules:
 * - Cannot start with a number
 * - Cannot be empty
 * - Cannot use reserved words
 * - Must contain only letters, numbers, and underscores
 * - Cannot be longer than 128 characters
 *
 * @param slug The slug string to validate
 * @throws Error if the slug is invalid
 */
export function validateSlug(slug: string): void {
  if (slug.length === 0) {
    throw new Error('Slug cannot be empty');
  }

  if (slug.length > 128) {
    throw new Error(`Slug '${slug}' cannot be longer than 128 characters`);
  }

  if (slug === 'run') {
    throw new Error(`Slug 'run' is reserved and cannot be used`);
  }

  if (/^\d/.test(slug)) {
    throw new Error(`Slug '${slug}' cannot start with a number`);
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(slug)) {
    throw new Error(
      `Slug '${slug}' can only contain letters, numbers, and underscores`
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
 * - startDelay should be >= 0
 *
 * @param options The runtime options to validate
 * @param opts Configuration options for validation
 * @param opts.optional If true, allows options to be null or undefined
 * @throws Error if any runtime option is invalid
 */
export function validateRuntimeOptions(
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    timeout?: number;
    startDelay?: number;
  },
  opts: ValidateRuntimeOptionsOpts = { optional: false }
): void {
  const { maxAttempts, baseDelay, timeout, startDelay } = options;

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

  if (startDelay !== undefined && startDelay !== null) {
    if (startDelay < 0) {
      throw new Error('startDelay must be greater than or equal to 0');
    }
  }
}
