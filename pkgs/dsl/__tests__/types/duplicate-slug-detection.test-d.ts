/**
 * Type tests for compile-time duplicate slug detection
 */

import { describe, it } from 'vitest';
import { Flow } from '../../src/dsl.js';

describe('Duplicate slug compile-time detection', () => {
  describe('step method', () => {
    it('should prevent duplicate slugs at compile time', () => {
      try {
        const flow = new Flow<Record<string, never>>({ slug: 'test' })
          .step({ slug: 'first' }, () => ({ data: 'test' }));

        // @ts-expect-error - Should not allow duplicate slug 'first'
        flow.step({ slug: 'first' }, () => ({ other: 'data' }));

        // Valid - different slug
        flow.step({ slug: 'second' }, () => ({ other: 'data' }));
      } catch {
        // Runtime errors are expected, we're testing compile-time type checking
      }
    });

    it('should work across multiple steps', () => {
      try {
        const flow = new Flow<Record<string, never>>({ slug: 'test' })
          .step({ slug: 'step1' }, () => ({ a: 1 }))
          .step({ slug: 'step2' }, () => ({ b: 2 }))
          .step({ slug: 'step3' }, () => ({ c: 3 }));

        // @ts-expect-error - Cannot reuse step1
        flow.step({ slug: 'step1' }, () => ({ d: 4 }));

        // @ts-expect-error - Cannot reuse step2
        flow.step({ slug: 'step2' }, () => ({ e: 5 }));

        // @ts-expect-error - Cannot reuse step3
        flow.step({ slug: 'step3' }, () => ({ f: 6 }));
      } catch {
        // Runtime errors are expected, we're testing compile-time type checking
      }
    });
  });

  describe('array method', () => {
    it('should prevent duplicate slugs at compile time', () => {
      try {
        const flow = new Flow<Record<string, never>>({ slug: 'test' })
          .array({ slug: 'items' }, () => [1, 2, 3]);

        // @ts-expect-error - Should not allow duplicate slug 'items'
        flow.array({ slug: 'items' }, () => ['a', 'b', 'c']);

        // Valid - different slug
        flow.array({ slug: 'other' }, () => ['a', 'b', 'c']);
      } catch {
        // Runtime errors are expected, we're testing compile-time type checking
      }
    });

    it('should prevent reusing slugs from step method', () => {
      try {
        const flow = new Flow<Record<string, never>>({ slug: 'test' })
          .step({ slug: 'process' }, () => ({ result: true }));

        // @ts-expect-error - Cannot reuse slug from step
        flow.array({ slug: 'process' }, () => [1, 2, 3]);
      } catch {
        // Runtime errors are expected, we're testing compile-time type checking
      }
    });
  });

  describe('map method', () => {
    it('should prevent duplicate slugs for root maps', () => {
      try {
        const flow = new Flow<number[]>({ slug: 'test' })
          .map({ slug: 'double' }, (n) => n * 2);

        // @ts-expect-error - Should not allow duplicate slug 'double'
        flow.map({ slug: 'double' }, (n) => n * 3);

        // Valid - different slug
        flow.map({ slug: 'triple' }, (n) => n * 3);
      } catch {
        // Runtime errors are expected, we're testing compile-time type checking
      }
    });

    it('should prevent duplicate slugs for dependent maps', () => {
      try {
        const flow = new Flow<Record<string, never>>({ slug: 'test' })
          .array({ slug: 'numbers' }, () => [1, 2, 3])
          .map({ slug: 'process', array: 'numbers' }, (n) => n * 2);

        // @ts-expect-error - Should not allow duplicate slug 'process'
        flow.map({ slug: 'process', array: 'numbers' }, (n) => n * 3);
      } catch {
        // Runtime errors are expected, we're testing compile-time type checking
      }
    });

    it('should prevent reusing slugs across different method types', () => {
      try {
        const flow = new Flow<Record<string, never>>({ slug: 'test' })
          .step({ slug: 'fetch' }, () => ({ data: [1, 2, 3] }))
          .array({ slug: 'items' }, () => ['a', 'b', 'c']);

        // @ts-expect-error - Cannot reuse 'fetch' from step
        flow.map({ slug: 'fetch', array: 'items' }, (item) => item);

        // @ts-expect-error - Cannot reuse 'items' from array
        flow.map({ slug: 'items', array: 'items' }, (item) => item);
      } catch {
        // Runtime errors are expected, we're testing compile-time type checking
      }
    });
  });

  describe('mixed methods', () => {
    it('should track slugs across all method types', () => {
      try {
        const flow = new Flow<number[]>({ slug: 'test' })
          .map({ slug: 'map1' }, (n) => n * 2)
          .step({ slug: 'step1' }, () => ({ result: 'test' }))
          .array({ slug: 'array1' }, () => [1, 2, 3]);

        // All these should error - slugs already used
        // @ts-expect-error - map1 already used
        flow.step({ slug: 'map1' }, () => ({}));

        // @ts-expect-error - step1 already used
        flow.array({ slug: 'step1' }, () => []);

        // @ts-expect-error - array1 already used
        flow.map({ slug: 'array1', array: 'array1' }, (n) => n);
      } catch {
        // Runtime errors are expected, we're testing compile-time type checking
      }
    });
  });
});