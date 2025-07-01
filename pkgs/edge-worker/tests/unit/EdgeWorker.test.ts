import { assertEquals } from '@std/assert';
import { 
  validateRetryConfig, 
  validateLegacyRetryConfig 
} from '../../src/queue/validateRetryConfig.ts';
import type { RetryConfig } from '../../src/queue/createQueueWorker.ts';

Deno.test('validateRetryConfig - retry config validation', async (t) => {
  await t.step('should return error for delay of 0 seconds', () => {
    const result = validateRetryConfig({
      strategy: 'fixed',
      limit: 3,
      baseDelay: 0,
    });
    assertEquals(result.valid, false);
    if (!result.valid) {
      assertEquals(result.error, 'baseDelay must be greater than 0');
    }
  });

  await t.step('should return error for negative delay', () => {
    const result = validateRetryConfig({
      strategy: 'fixed',
      limit: 3,
      baseDelay: -5,
    });
    assertEquals(result.valid, false);
    if (!result.valid) {
      assertEquals(result.error, 'baseDelay must be greater than 0');
    }
  });

  await t.step('should return error for fractional delay', () => {
    const result = validateRetryConfig({
      strategy: 'fixed',
      limit: 3,
      baseDelay: 2.5,
    });
    assertEquals(result.valid, false);
    if (!result.valid) {
      assertEquals(result.error, 'baseDelay must be an integer');
    }
  });

  await t.step('should return error for negative limit', () => {
    const result = validateRetryConfig({
      strategy: 'fixed',
      limit: -1,
      baseDelay: 3,
    });
    assertEquals(result.valid, false);
    if (!result.valid) {
      assertEquals(result.error, 'limit must be greater than or equal to 0');
    }
  });

  await t.step('should return error for fractional limit', () => {
    const result = validateRetryConfig({
      strategy: 'fixed',
      limit: 3.5,
      baseDelay: 3,
    });
    assertEquals(result.valid, false);
    if (!result.valid) {
      assertEquals(result.error, 'limit must be an integer');
    }
  });

  await t.step('should return error for invalid strategy', () => {
    const result = validateRetryConfig({
      strategy: 'invalid' as unknown as 'fixed' | 'exponential',
      limit: 3,
      baseDelay: 3,
    });
    assertEquals(result.valid, false);
    if (!result.valid) {
      assertEquals(result.error, 'Invalid retry strategy: invalid. Must be \'fixed\' or \'exponential\'');
    }
  });

  await t.step('should return valid for exponential strategy without maxDelay', () => {
    const config: RetryConfig = {
      strategy: 'exponential',
      limit: 3,
      baseDelay: 3,
    };
    const result = validateRetryConfig(config);
    assertEquals(result.valid, true);
  });

  await t.step('should return error for fixed strategy with maxDelay', () => {
    const result = validateRetryConfig({
      strategy: 'fixed',
      limit: 3,
      baseDelay: 3,
      // @ts-expect-error maxDelay is not valid for fixed strategy
      maxDelay: 100,
    });
    assertEquals(result.valid, false);
    if (!result.valid) {
      assertEquals(result.error, 'maxDelay is only valid for exponential strategy');
    }
  });

  await t.step('should return error for exponential strategy with negative maxDelay', () => {
    const result = validateRetryConfig({
      strategy: 'exponential',
      limit: 3,
      baseDelay: 3,
      maxDelay: -100,
    });
    assertEquals(result.valid, false);
    if (!result.valid) {
      assertEquals(result.error, 'maxDelay must be greater than 0');
    }
  });

  await t.step('should return error for exponential strategy with fractional maxDelay', () => {
    const result = validateRetryConfig({
      strategy: 'exponential',
      limit: 3,
      baseDelay: 3,
      maxDelay: 100.5,
    });
    assertEquals(result.valid, false);
    if (!result.valid) {
      assertEquals(result.error, 'maxDelay must be an integer');
    }
  });

  await t.step('should return error for exponential strategy with maxDelay less than baseDelay', () => {
    const result = validateRetryConfig({
      strategy: 'exponential',
      limit: 3,
      baseDelay: 10,
      maxDelay: 5,
    });
    assertEquals(result.valid, false);
    if (!result.valid) {
      assertEquals(result.error, 'maxDelay must be greater than or equal to baseDelay');
    }
  });

  await t.step('should return valid for valid fixed strategy config', () => {
    const result = validateRetryConfig({
      strategy: 'fixed',
      limit: 5,
      baseDelay: 3,
    });
    assertEquals(result.valid, true);
  });

  await t.step('should return valid for valid exponential strategy config', () => {
    const result = validateRetryConfig({
      strategy: 'exponential',
      limit: 5,
      baseDelay: 3,
      maxDelay: 300,
    });
    assertEquals(result.valid, true);
  });

  await t.step('should return valid for limit of 0 (no retries)', () => {
    const result = validateRetryConfig({
      strategy: 'fixed',
      limit: 0,
      baseDelay: 3,
    });
    assertEquals(result.valid, true);
  });
});

// Legacy config validation tests
Deno.test('validateLegacyRetryConfig - legacy retry config validation', async (t) => {
  await t.step('should return error for negative retryDelay', () => {
    const result = validateLegacyRetryConfig({
      queueName: 'test',
      retryDelay: -5,
    });
    assertEquals(result.valid, false);
    if (!result.valid) {
      assertEquals(result.error, 'retryDelay must be greater than 0');
    }
  });

  await t.step('should return error for retryDelay of 0', () => {
    const result = validateLegacyRetryConfig({
      queueName: 'test',
      retryDelay: 0,
    });
    assertEquals(result.valid, false);
    if (!result.valid) {
      assertEquals(result.error, 'retryDelay must be greater than 0');
    }
  });

  await t.step('should return error for fractional retryDelay', () => {
    const result = validateLegacyRetryConfig({
      queueName: 'test',
      retryDelay: 2.5,
    });
    assertEquals(result.valid, false);
    if (!result.valid) {
      assertEquals(result.error, 'retryDelay must be an integer');
    }
  });

  await t.step('should return error for negative retryLimit', () => {
    const result = validateLegacyRetryConfig({
      queueName: 'test',
      retryLimit: -1,
    });
    assertEquals(result.valid, false);
    if (!result.valid) {
      assertEquals(result.error, 'retryLimit must be greater than or equal to 0');
    }
  });

  await t.step('should return error for fractional retryLimit', () => {
    const result = validateLegacyRetryConfig({
      queueName: 'test',
      retryLimit: 3.5,
    });
    assertEquals(result.valid, false);
    if (!result.valid) {
      assertEquals(result.error, 'retryLimit must be an integer');
    }
  });

  await t.step('should return valid for valid legacy config', () => {
    const result = validateLegacyRetryConfig({
      queueName: 'test',
      retryDelay: 5,
      retryLimit: 3,
    });
    assertEquals(result.valid, true);
  });

  await t.step('should return valid for retryLimit of 0 (no retries)', () => {
    const result = validateLegacyRetryConfig({
      queueName: 'test',
      retryLimit: 0,
    });
    assertEquals(result.valid, true);
  });
});

// Test collecting multiple errors (future enhancement example)
Deno.test('Example: collecting multiple validation errors', () => {
  // This demonstrates how the pattern could be extended to collect multiple errors
  const config: RetryConfig = {
    strategy: 'fixed',
    limit: -1,  // invalid
    baseDelay: 0,  // invalid
  };
  
  // Current implementation returns first error
  const result = validateRetryConfig(config);
  assertEquals(result.valid, false);
  
  // In the future, we could enhance to return all errors:
  // const results = validateRetryConfigWithAllErrors(config);
  // assertEquals(results.errors, [
  //   'limit must be greater than or equal to 0',
  //   'baseDelay must be greater than 0'
  // ]);
});