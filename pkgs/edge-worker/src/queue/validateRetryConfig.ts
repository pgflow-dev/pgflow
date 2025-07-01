import type { RetryConfig, QueueWorkerConfig } from './createQueueWorker.js';

export type ValidationResult = 
  | { valid: true }
  | { valid: false; error: string };

/**
 * Validates retry configuration to ensure all values are valid
 * @param config - The retry configuration to validate
 * @returns ValidationResult indicating success or failure with error message
 */
export function validateRetryConfig(config: RetryConfig): ValidationResult {
  // Validate strategy
  if (config.strategy !== 'fixed' && config.strategy !== 'exponential') {
    return { 
      valid: false, 
      error: `Invalid retry strategy: ${(config as { strategy: string }).strategy}. Must be 'fixed' or 'exponential'` 
    };
  }

  // Validate limit
  if (!Number.isInteger(config.limit)) {
    return { valid: false, error: 'limit must be an integer' };
  }
  if (config.limit < 0) {
    return { valid: false, error: 'limit must be greater than or equal to 0' };
  }

  // Validate baseDelay
  if (!Number.isInteger(config.baseDelay)) {
    return { valid: false, error: 'baseDelay must be an integer' };
  }
  if (config.baseDelay <= 0) {
    return { valid: false, error: 'baseDelay must be greater than 0' };
  }

  // Strategy-specific validation
  if (config.strategy === 'fixed') {
    // Check for invalid properties
    if ('maxDelay' in config) {
      return { valid: false, error: 'maxDelay is only valid for exponential strategy' };
    }
  } else if (config.strategy === 'exponential') {
    // Validate maxDelay if provided
    if (config.maxDelay !== undefined) {
      if (!Number.isInteger(config.maxDelay)) {
        return { valid: false, error: 'maxDelay must be an integer' };
      }
      if (config.maxDelay <= 0) {
        return { valid: false, error: 'maxDelay must be greater than 0' };
      }
      if (config.maxDelay < config.baseDelay) {
        return { valid: false, error: 'maxDelay must be greater than or equal to baseDelay' };
      }
    }
  }

  return { valid: true };
}

/**
 * Validates legacy retry configuration
 * @param config - The queue worker configuration with potential legacy fields
 * @returns ValidationResult indicating success or failure with error message
 */
export function validateLegacyRetryConfig(config: QueueWorkerConfig): ValidationResult {
  if (config.retryDelay !== undefined) {
    if (!Number.isInteger(config.retryDelay)) {
      return { valid: false, error: 'retryDelay must be an integer' };
    }
    if (config.retryDelay <= 0) {
      return { valid: false, error: 'retryDelay must be greater than 0' };
    }
  }

  if (config.retryLimit !== undefined) {
    if (!Number.isInteger(config.retryLimit)) {
      return { valid: false, error: 'retryLimit must be an integer' };
    }
    if (config.retryLimit < 0) {
      return { valid: false, error: 'retryLimit must be greater than or equal to 0' };
    }
  }

  return { valid: true };
}