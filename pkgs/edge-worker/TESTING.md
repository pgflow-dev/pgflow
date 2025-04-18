# Testing in edge-worker

This package is in the process of migrating from Deno tests to Vitest. Both test frameworks are currently supported, but new tests should be written using Vitest.

## Running Tests

### Vitest (Recommended)

```bash
# Run unit tests
nx test:unit edge-worker

# Run integration tests
nx test:integration edge-worker

# Run e2e tests
nx test:e2e edge-worker

# Run all tests
nx test edge-worker
```

### Deno (Legacy)

```bash
# Run unit tests
nx test:deno:unit edge-worker

# Run integration tests
nx test:deno:integration edge-worker

# Run e2e tests
nx test:deno:e2e edge-worker

# Run all tests
nx test:deno edge-worker
```

## Migration Guide

When migrating tests from Deno to Vitest, follow these guidelines:

1. Replace imports:
   ```typescript
   // Deno
   import { assertEquals, assertThrows } from '@std/assert';
   import { delay } from '@std/async';
   
   // Vitest
   import { describe, it, expect, vi } from 'vitest';
   import { sleep } from '../utils';
   ```

2. Replace test structure:
   ```typescript
   // Deno
   Deno.test('test name', async () => {
     // test code
   });
   
   // Vitest
   describe('Module name', () => {
     it('test name', async () => {
       // test code
     });
   });
   ```

3. Replace assertions:
   ```typescript
   // Deno
   assertEquals(actual, expected);
   assertThrows(() => fn(), Error);
   
   // Vitest
   expect(actual).toEqual(expected);
   expect(() => fn()).toThrow(Error);
   ```

4. Replace spies and mocks:
   ```typescript
   // Deno
   const spy = spy(obj, 'method');
   assertSpyCalls(spy, 1);
   
   // Vitest
   const spy = vi.spyOn(obj, 'method');
   expect(spy).toHaveBeenCalledTimes(1);
   ```

5. Replace delay:
   ```typescript
   // Deno
   await delay(100);
   
   // Vitest
   await sleep(100);
   ```

6. For database tests, use the new transaction helpers:
   ```typescript
   // Vitest
   describe('Database tests', () => {
     const getSql = setupTransactionTests();
     
     it('should do something with the database', async () => {
       const sql = getSql();
       // test code using sql
     });
   });
   ```

## File Extensions

When importing from source files, use `.js` extensions instead of `.ts` extensions:

```typescript
// Correct
import { MyClass } from '../../src/myModule.js';

// Incorrect
import { MyClass } from '../../src/myModule.ts';
```

This is necessary for proper ESM compatibility in the Node.js environment used by Vitest.
