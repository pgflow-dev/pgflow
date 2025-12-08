# Edge Worker Tests

## Test Types

- **unit/**: Fast, isolated tests with mocked dependencies
- **integration/**: Tests with real database, use `withTransaction()` for isolation
- **e2e/**: Full stack tests against running Supabase instance

## Testing Patterns

### Platform Mocking (Unit Tests)

Create mock deps inline and pass to adapter constructor:

```typescript
const deps = {
  getEnv: () => ({ SUPABASE_URL: 'http://test.supabase.co', ... }),
  onShutdown: () => {},
  extendLifetime: () => {},
  serve: () => {},
};
const adapter = new SupabasePlatformAdapter(undefined, deps);
```

### Global Platform Configuration

For tests that need global platform config:

```typescript
import { configurePlatform } from '../../src/testing.ts';

configurePlatform({ getEnv: () => customEnv, ... });
// Note: configurePlatform is permanent for process lifetime
```

### Database Isolation

Use `withTransaction()` for automatic rollback:

```typescript
import { withTransaction } from '../db.ts';

Deno.test('database test', () =>
  withTransaction(async (sql) => {
    // changes auto-rollback after test
  })
);
```

### Resource Cleanup

For tests creating real resources, use try-finally:

```typescript
const worker = new Worker();
try {
  worker.start();
  // test logic
} finally {
  await worker.stop();
}
```

For unit tests with mocks, use `sanitizeResources: false`:

```typescript
Deno.test({
  name: 'mocked test',
  sanitizeResources: false,
  fn: () => { /* test */ },
});
```
