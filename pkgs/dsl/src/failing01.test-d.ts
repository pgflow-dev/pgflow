import { test, assertType, expectTypeOf } from 'vitest';

test('should pass', () => {
  expectTypeOf({ a: 1 }).toEqualTypeOf<{ a: number }>();
  assertType<string>('hello'); // passes
});

test('should fail', () => {
  expectTypeOf({ a: 1 }).toEqualTypeOf<{ a: string }>();
  assertType<string>(23); // should fail
});
