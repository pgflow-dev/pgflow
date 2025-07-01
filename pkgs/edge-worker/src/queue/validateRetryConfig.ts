import type { RetryConfig } from './createQueueWorker.js';

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

  // Strategy-specific validation
  if (config.strategy === 'fixed') {
    // Check for invalid properties
    if ('maxDelay' in config) {
      throw new Error('maxDelay is only valid for exponential strategy');
    }
  } else if (config.strategy === 'exponential') {
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
    }
  }
}