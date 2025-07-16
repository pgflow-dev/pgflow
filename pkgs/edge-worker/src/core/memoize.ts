/**
 * Simple memoization utility for zero-argument functions
 * Caches the result of the first call and returns it for subsequent calls
 */
export function memoize<T>(fn: () => T): () => T {
  let cached = false;
  let result: T;
  
  return () => {
    if (!cached) {
      result = fn();
      cached = true;
    }
    return result;
  };
}