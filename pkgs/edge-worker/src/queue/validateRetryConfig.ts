import type { RetryConfig } from './createQueueWorker.js';

/**
 * Maximum value for PostgreSQL interval type (signed 32-bit integer)
 * This is the maximum number of seconds that can be stored in a PostgreSQL interval
 */
const MAX_POSTGRES_INTERVAL_SECONDS = 2147483647;

/**
 * Validates retry configuration to ensure all values are valid
 * @param config - The retry configuration to validate
 * @throws Error if any configuration value is invalid
 */
export function validateRetryConfig(config: RetryConfig): void {
  // Validate strategy
  if (config.strategy !== 'fixed' && config.strategy !== 'exponential') {
    throw new Error(`Invalid retry strategy: ${(config as { strategy: string }).strategy}. Must be 'fixed' or 'exponential'`);
  }

  // Validate limit
  if (!Number.isInteger(config.limit)) {
    throw new Error('limit must be an integer');
  }
  if (config.limit < 0) {
    throw new Error('limit must be greater than or equal to 0');
  }

  // Validate baseDelay
  if (!Number.isInteger(config.baseDelay)) {
    throw new Error('baseDelay must be an integer');
  }
  if (config.baseDelay <= 0) {
    throw new Error('baseDelay must be greater than 0');
  }
  // Prevent values that would overflow PostgreSQL interval type
  if (config.baseDelay > MAX_POSTGRES_INTERVAL_SECONDS) {
    throw new Error(`baseDelay must not exceed ${MAX_POSTGRES_INTERVAL_SECONDS} seconds`);
  }

  // Strategy-specific validation
  if (config.strategy === 'fixed') {
    // Check for invalid properties
    if ('maxDelay' in config) {
      throw new Error('maxDelay is only valid for exponential strategy');
    }
  } else if (config.strategy === 'exponential') {
    // Prevent overflow in Math.pow(2, limit-1)
    if (config.limit > 50) {
      throw new Error('For exponential strategy, limit must not exceed 50 to prevent calculation overflow');
    }
    
    // Validate maxDelay if provided
    if (config.maxDelay !== undefined) {
      if (!Number.isInteger(config.maxDelay)) {
        throw new Error('maxDelay must be an integer');
      }
      if (config.maxDelay <= 0) {
        throw new Error('maxDelay must be greater than 0');
      }
      if (config.maxDelay < config.baseDelay) {
        throw new Error('maxDelay must be greater than or equal to baseDelay');
      }
      // Prevent values that would overflow PostgreSQL interval type
      if (config.maxDelay > MAX_POSTGRES_INTERVAL_SECONDS) {
        throw new Error(`maxDelay must not exceed ${MAX_POSTGRES_INTERVAL_SECONDS} seconds`);
      }
    }
  }
}