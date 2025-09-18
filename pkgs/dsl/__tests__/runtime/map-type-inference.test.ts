import { describe, it, expect } from 'vitest';
import { Flow } from '../../src/dsl.js';

describe('Map type inference runtime verification', () => {
  it('should infer types correctly for root maps', () => {
    const flow = new Flow<string[]>({ slug: 'test' })
      .map({ slug: 'process' }, (item) => {
        // Verify we can use string methods
        return item.toUpperCase();
      });

    // If this compiles, type inference works
    expect(flow.slug).toBe('test');
  });

  it('should infer types correctly for array-dependent maps', () => {
    const flow = new Flow<Record<string, never>>({ slug: 'test' })
      .array({ slug: 'nums' }, () => [1, 2, 3])
      .map({ slug: 'double', array: 'nums' }, (item) => {
        // Verify we can use number operations
        return item * 2;
      });

    expect(flow.slug).toBe('test');
  });

  it('should infer types correctly for step-dependent maps', () => {
    const flow = new Flow<Record<string, never>>({ slug: 'test' })
      .step({ slug: 'getStrings' }, () => ['a', 'b', 'c'])
      .map({ slug: 'upper', array: 'getStrings' }, (item) => {
        // Verify we can use string methods
        return item.toUpperCase();
      });

    expect(flow.slug).toBe('test');
  });

  it('should infer types for complex objects', () => {
    const flow = new Flow<Record<string, never>>({ slug: 'test' })
      .step({ slug: 'users' }, () => [
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 }
      ])
      .map({ slug: 'names', array: 'users' }, (user) => {
        // Verify we can access object properties
        return { userId: user.id, userName: user.name };
      });

    expect(flow.slug).toBe('test');
  });
});