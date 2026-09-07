import { describe, it, expect } from 'vitest';
import { Flow } from '../../src/dsl.js';

describe('Map flow integration tests', () => {
  describe('runtime validation', () => {
    it('should throw when trying to use non-existent step as array dependency', () => {
      const flow = new Flow<Record<string, never>>({ slug: 'test' })
        .step({ slug: 'exists' }, () => [1, 2, 3]);

      expect(() => {
        // @ts-expect-error - TypeScript should catch this at compile time
        flow.map({ slug: 'fail', array: 'doesNotExist' }, (item) => item);
      }).toThrow('Step "fail" depends on undefined step "doesNotExist"');
    });

    it('should throw when step slug already exists', () => {
      const flow = new Flow<number[]>({ slug: 'test' })
        .map({ slug: 'process' }, (n) => n * 2);

      expect(() => {
        flow.map({ slug: 'process' }, (n) => n * 3);
      }).toThrow('Step "process" already exists in flow "test"');
    });

    it('should validate slug format', () => {
      expect(() => {
        new Flow<number[]>({ slug: 'test' })
          .map({ slug: 'invalid-slug!' }, (n) => n);
      }).toThrow(); // validateSlug should reject invalid characters
    });

    it('should validate runtime options', () => {
      // This should not throw - valid options
      const validFlow = new Flow<number[]>({ slug: 'test' })
        .map({
          slug: 'valid',
          maxAttempts: 3,
          baseDelay: 1000,
          timeout: 30000,
          startDelay: 5000
        }, (n) => n);

      expect(validFlow.stepOrder).toEqual(['valid']);
      expect(validFlow.getStepDefinition('valid').options).toMatchObject({
        maxAttempts: 3,
        baseDelay: 1000,
        timeout: 30000,
        startDelay: 5000,
      });

      // Invalid options should be caught by validateRuntimeOptions
      expect(() => {
        new Flow<number[]>({ slug: 'test' })
          .map({
            slug: 'invalid',
            maxAttempts: 0 // Should be >= 1
          }, (n) => n);
      }).toThrow();
    });
  });

  describe('type inference validation', () => {
    it('should correctly infer types through map chains', () => {
      const flow = new Flow<{ items: string[] }>({ slug: 'test' })
        .step({ slug: 'extract' }, (flowInput) => flowInput.items)
        .map({ slug: 'lengths', array: 'extract' }, (item) => item.length)
        .map({ slug: 'doubles', array: 'lengths' }, (len) => len * 2)
        .step({ slug: 'sum', dependsOn: ['doubles'] }, (deps) => {
          // Type checking - this should compile without errors
          const total: number = deps.doubles.reduce((a, b) => a + b, 0);
          return total;
        });

      expect(flow.stepOrder).toEqual(['extract', 'lengths', 'doubles', 'sum']);
    });
  });
});
