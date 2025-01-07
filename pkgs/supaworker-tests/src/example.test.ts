import { describe, it, expect } from 'vitest';

describe('Basic test suite', () => {
  it('should pass a simple test', () => {
    expect(true).toBe(true);
  });

  it('should perform basic math', () => {
    expect(1 + 1).toBe(2);
  });

  it('should work with async operations', async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });

  it('should handle arrays', () => {
    const arr = [1, 2, 3];
    expect(arr).toHaveLength(3);
    expect(arr).toContain(2);
  });
});

describe('String operations', () => {
  it('should concatenate strings', () => {
    const str1 = 'Hello';
    const str2 = 'World';
    expect(`${str1} ${str2}`).toBe('Hello World');
  });
});
