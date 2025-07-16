import { assertEquals } from '@std/assert';
import { memoize } from '../../src/core/memoize.ts';

Deno.test('memoize - calls function only once', () => {
  let callCount = 0;
  const fn = () => {
    callCount++;
    return 'result';
  };
  
  const memoized = memoize(fn);
  
  // First call
  assertEquals(memoized(), 'result');
  assertEquals(callCount, 1);
  
  // Second call - should not increment callCount
  assertEquals(memoized(), 'result');
  assertEquals(callCount, 1);
  
  // Third call - still should not increment
  assertEquals(memoized(), 'result');
  assertEquals(callCount, 1);
});

Deno.test('memoize - returns same object reference', () => {
  const obj = { key: 'value' };
  const fn = () => obj;
  
  const memoized = memoize(fn);
  
  const result1 = memoized();
  const result2 = memoized();
  const result3 = memoized();
  
  // All results should be the same reference
  assertEquals(result1, result2);
  assertEquals(result2, result3);
  assertEquals(result1, obj);
});

Deno.test('memoize - handles null and undefined correctly', () => {
  const fnNull = () => null;
  const fnUndefined = () => undefined;
  
  const memoizedNull = memoize(fnNull);
  const memoizedUndefined = memoize(fnUndefined);
  
  assertEquals(memoizedNull(), null);
  assertEquals(memoizedNull(), null);
  
  assertEquals(memoizedUndefined(), undefined);
  assertEquals(memoizedUndefined(), undefined);
});

Deno.test('memoize - different memoized functions are independent', () => {
  let count1 = 0;
  let count2 = 0;
  
  const fn1 = () => ++count1;
  const fn2 = () => ++count2;
  
  const memoized1 = memoize(fn1);
  const memoized2 = memoize(fn2);
  
  assertEquals(memoized1(), 1);
  assertEquals(memoized1(), 1);
  assertEquals(count1, 1);
  
  assertEquals(memoized2(), 1);
  assertEquals(memoized2(), 1);
  assertEquals(count2, 1);
});