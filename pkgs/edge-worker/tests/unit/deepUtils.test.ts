import { assertEquals, assertThrows } from '@std/assert';
import { deepClone, deepFreeze } from '../../src/core/deepUtils.ts';

Deno.test('deepClone - handles nested objects correctly', () => {
  const original = {
    retry: { strategy: 'fixed' as const, limit: 3, baseDelay: 2 },
    nested: { deep: { value: 42 } },
    array: [1, { nested: true }]
  };

  const cloned = deepClone(original);
  
  // Should be different object
  assertEquals(cloned !== original, true);
  assertEquals(cloned.retry !== original.retry, true);
  assertEquals(cloned.nested !== original.nested, true);
  assertEquals(cloned.array !== original.array, true);
  
  // But same values
  assertEquals(cloned.retry.strategy, 'fixed');
  assertEquals(cloned.nested.deep.value, 42);
  assertEquals(cloned.array[0], 1);
});

Deno.test('deepClone - handles null and undefined', () => {
  assertEquals(deepClone(null), null);
  assertEquals(deepClone(undefined), undefined);
  assertEquals(deepClone({ value: null }).value, null);
});

Deno.test('deepClone - handles Date objects', () => {
  const date = new Date('2024-01-01');
  const cloned = deepClone({ date });
  
  assertEquals(cloned.date instanceof Date, true);
  assertEquals(cloned.date.getTime(), date.getTime());
  assertEquals(cloned.date !== date, true); // Different object
});

Deno.test('deepFreeze - prevents nested modifications', () => {
  const obj = {
    retry: { strategy: 'fixed' as const, limit: 3 },
    array: [{ item: 'test' }]
  };

  const frozen = deepFreeze(obj);
  
  // Top level frozen
  assertThrows(() => {
    (frozen as Record<string, unknown>).newProp = 'test';
  }, TypeError);
  
  // Nested object frozen
  assertThrows(() => {
    (frozen.retry as Record<string, unknown>).limit = 999;
  }, TypeError);
  
  // Array items frozen
  assertThrows(() => {
    (frozen.array[0] as Record<string, unknown>).item = 'modified';
  }, TypeError);
  
  // Array itself frozen
  assertThrows(() => {
    (frozen.array as Array<unknown>).push({ item: 'new' });
  }, TypeError);
});

Deno.test('deepFreeze - handles functions', () => {
  const fn = () => 'test';
  const obj = { fn };
  
  const frozen = deepFreeze(obj);
  
  // Function still callable
  assertEquals(frozen.fn(), 'test');
  
  // Object is frozen
  assertThrows(() => {
    (frozen as Record<string, unknown>).newProp = 'test';
  }, TypeError);
});