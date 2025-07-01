import { assertEquals } from '@std/assert';
import { calculateRetryDelay, type RetryConfig } from '../../src/queue/createQueueWorker.ts';

Deno.test('calculateRetryDelay - fixed strategy returns constant delay for all attempts', () => {
  const config: RetryConfig = {
    strategy: 'fixed',
    limit: 5,
    baseDelay: 10,
  };

  assertEquals(calculateRetryDelay(1, config), 10);
  assertEquals(calculateRetryDelay(2, config), 10);
  assertEquals(calculateRetryDelay(3, config), 10);
  assertEquals(calculateRetryDelay(4, config), 10);
  assertEquals(calculateRetryDelay(5, config), 10);
});

Deno.test('calculateRetryDelay - fixed strategy handles different base delays', () => {
  const config: RetryConfig = {
    strategy: 'fixed',
    limit: 3,
    baseDelay: 25,
  };

  assertEquals(calculateRetryDelay(1, config), 25);
  assertEquals(calculateRetryDelay(2, config), 25);
  assertEquals(calculateRetryDelay(3, config), 25);
});

Deno.test('calculateRetryDelay - exponential strategy doubles delay for each attempt', () => {
  const config: RetryConfig = {
    strategy: 'exponential',
    limit: 5,
    baseDelay: 2,
  };

  assertEquals(calculateRetryDelay(1, config), 2);   // 2 * 2^0 = 2
  assertEquals(calculateRetryDelay(2, config), 4);   // 2 * 2^1 = 4
  assertEquals(calculateRetryDelay(3, config), 8);   // 2 * 2^2 = 8
  assertEquals(calculateRetryDelay(4, config), 16);  // 2 * 2^3 = 16
  assertEquals(calculateRetryDelay(5, config), 32);  // 2 * 2^4 = 32
});

Deno.test('calculateRetryDelay - exponential strategy respects maxDelay when specified', () => {
  const config: RetryConfig = {
    strategy: 'exponential',
    limit: 10,
    baseDelay: 5,
    maxDelay: 20,
  };

  assertEquals(calculateRetryDelay(1, config), 5);   // 5 * 2^0 = 5
  assertEquals(calculateRetryDelay(2, config), 10);  // 5 * 2^1 = 10
  assertEquals(calculateRetryDelay(3, config), 20);  // 5 * 2^2 = 20 (capped)
  assertEquals(calculateRetryDelay(4, config), 20);  // 5 * 2^3 = 40 (capped at 20)
  assertEquals(calculateRetryDelay(5, config), 20);  // 5 * 2^4 = 80 (capped at 20)
});

Deno.test('calculateRetryDelay - exponential strategy uses default maxDelay of 300 when not specified', () => {
  const config: RetryConfig = {
    strategy: 'exponential',
    limit: 10,
    baseDelay: 10,
  };

  assertEquals(calculateRetryDelay(1, config), 10);   // 10 * 2^0 = 10
  assertEquals(calculateRetryDelay(2, config), 20);   // 10 * 2^1 = 20
  assertEquals(calculateRetryDelay(3, config), 40);   // 10 * 2^2 = 40
  assertEquals(calculateRetryDelay(4, config), 80);   // 10 * 2^3 = 80
  assertEquals(calculateRetryDelay(5, config), 160);  // 10 * 2^4 = 160
  assertEquals(calculateRetryDelay(6, config), 300);  // 10 * 2^5 = 320 (capped at 300)
  assertEquals(calculateRetryDelay(7, config), 300);  // 10 * 2^6 = 640 (capped at 300)
});

Deno.test('calculateRetryDelay - exponential strategy handles edge case of attempt 0', () => {
  const config: RetryConfig = {
    strategy: 'exponential',
    limit: 5,
    baseDelay: 3,
  };

  // Even though attempt 0 shouldn't happen in practice, ensure it doesn't break
  assertEquals(calculateRetryDelay(0, config), 1.5); // 3 * 2^(-1) = 1.5
});

Deno.test('calculateRetryDelay - handles very large attempt numbers for fixed strategy', () => {
  const config: RetryConfig = {
    strategy: 'fixed',
    limit: 5,
    baseDelay: 15,
  };

  assertEquals(calculateRetryDelay(100, config), 15);
  assertEquals(calculateRetryDelay(1000, config), 15);
});

Deno.test('calculateRetryDelay - handles very large attempt numbers for exponential strategy', () => {
  const config: RetryConfig = {
    strategy: 'exponential',
    limit: 5,
    baseDelay: 1,
    maxDelay: 100,
  };

  assertEquals(calculateRetryDelay(100, config), 100); // Would be huge, but capped
  assertEquals(calculateRetryDelay(1000, config), 100); // Would be huge, but capped
});

