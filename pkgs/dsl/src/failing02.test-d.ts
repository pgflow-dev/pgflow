import { test, expectTypeOf } from 'vitest';

// This test should fail type checking
test('should explicitly fail type checking', () => {
  // @ts-expect-error
  const x: string = 42; // This should cause a type error

  // This should fail type checking
  expectTypeOf<number>().toEqualTypeOf<string>();
});
