import { assertThrows } from '@std/assert';
import { validateRetryConfig } from '../../src/queue/validateRetryConfig.ts';
import type { RetryConfig } from '../../src/queue/createQueueWorker.ts';

Deno.test('validateRetryConfig - retry config validation', async (t) => {
  await t.step('should throw error for delay of 0 seconds', () => {
    assertThrows(
      () => validateRetryConfig({
        strategy: 'fixed',
        limit: 3,
        baseDelay: 0,
      }),
      Error,
      'baseDelay must be greater than 0'
    );
  });

  await t.step('should throw error for negative delay', () => {
    assertThrows(
      () => validateRetryConfig({
        strategy: 'fixed',
        limit: 3,
        baseDelay: -5,
      }),
      Error,
      'baseDelay must be greater than 0'
    );
  });

  await t.step('should throw error for fractional delay', () => {
    assertThrows(
      () => validateRetryConfig({
        strategy: 'fixed',
        limit: 3,
        baseDelay: 2.5,
      }),
      Error,
      'baseDelay must be an integer'
    );
  });

  await t.step('should throw error for negative limit', () => {
    assertThrows(
      () => validateRetryConfig({
        strategy: 'fixed',
        limit: -1,
        baseDelay: 3,
      }),
      Error,
      'limit must be greater than or equal to 0'
    );
  });

  await t.step('should throw error for fractional limit', () => {
    assertThrows(
      () => validateRetryConfig({
        strategy: 'fixed',
        limit: 3.5,
        baseDelay: 3,
      }),
      Error,
      'limit must be an integer'
    );
  });

  await t.step('should throw error for invalid strategy', () => {
    assertThrows(
      () => validateRetryConfig({
        strategy: 'invalid' as unknown as 'fixed' | 'exponential',
        limit: 3,
        baseDelay: 3,
      }),
      Error,
      'Invalid retry strategy: invalid'
    );
  });

  await t.step('should not throw for exponential strategy without maxDelay', () => {
    const config: RetryConfig = {
      strategy: 'exponential',
      limit: 3,
      baseDelay: 3,
    };
    // Should not throw
    validateRetryConfig(config);
  });

  await t.step('should throw error for fixed strategy with maxDelay', () => {
    assertThrows(
      () => validateRetryConfig({
        strategy: 'fixed',
        limit: 3,
        baseDelay: 3,
        // @ts-expect-error maxDelay is not valid for fixed strategy
        maxDelay: 100,
      }),
      Error,
      'maxDelay is only valid for exponential strategy'
    );
  });

  await t.step('should throw error for exponential strategy with negative maxDelay', () => {
    assertThrows(
      () => validateRetryConfig({
        strategy: 'exponential',
        limit: 3,
        baseDelay: 3,
        maxDelay: -100,
      }),
      Error,
      'maxDelay must be greater than 0'
    );
  });

  await t.step('should throw error for exponential strategy with fractional maxDelay', () => {
    assertThrows(
      () => validateRetryConfig({
        strategy: 'exponential',
        limit: 3,
        baseDelay: 3,
        maxDelay: 100.5,
      }),
      Error,
      'maxDelay must be an integer'
    );
  });

  await t.step('should throw error for exponential strategy with maxDelay less than baseDelay', () => {
    assertThrows(
      () => validateRetryConfig({
        strategy: 'exponential',
        limit: 3,
        baseDelay: 10,
        maxDelay: 5,
      }),
      Error,
      'maxDelay must be greater than or equal to baseDelay'
    );
  });

  await t.step('should not throw for valid fixed strategy config', () => {
    // Should not throw
    validateRetryConfig({
      strategy: 'fixed',
      limit: 5,
      baseDelay: 3,
    });
  });

  await t.step('should not throw for valid exponential strategy config', () => {
    // Should not throw
    validateRetryConfig({
      strategy: 'exponential',
      limit: 5,
      baseDelay: 3,
      maxDelay: 300,
    });
  });

  await t.step('should not throw for limit of 0 (no retries)', () => {
    // Should not throw
    validateRetryConfig({
      strategy: 'fixed',
      limit: 0,
      baseDelay: 3,
    });
  });
});